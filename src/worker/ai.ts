/**
 * The AI layer: Vercel AI SDK v7 + @openrouter/ai-sdk-provider, structured output via
 * response_format json_schema, always re-validated with Zod.
 *
 *   primary (timeout ~12s) ── invalid ──▶ primary again with the errors fed back
 *        │ error/timeout                        │ invalid / error
 *        ▼                                      ▼
 *   secondary (independent family) ──────── fail ──▶ LlmFailure (caller writes the DLQ row)
 *
 * Every HTTP call writes one ledger row through `onCall` (model, tokens, usage.cost, ms, ok).
 * Provider routing on every call: data_collection deny, require_parameters, sort by throughput,
 * usage accounting on, reasoning off. Anthropic models reject `temperature` under
 * require_parameters, so it is omitted for them.
 *
 * No `cloudflare:*` imports: Node scripts use this same client with the build key.
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, jsonSchema, NoObjectGeneratedError, Output, type ModelMessage } from 'ai';
import { estimateCost, estimateTokens } from '../shared/scoring.ts';
import { LlmFailure, type LlmCallRow, type LlmClient, type LlmMeta, type LlmRequest } from '../pipeline/types.ts';

export type LlmConfig = {
  apiKey: string;
  primary: string;
  secondary: string;
  baseURL?: string;
  primaryTimeoutMs?: number;
  secondaryTimeoutMs?: number;
  onCall?: (row: LlmCallRow) => void | Promise<void>;
  /** Extra headers (OpenRouter app attribution). */
  appName?: string;
  fetch?: typeof fetch;
  /**
   * Aborts every in-flight and future call of this client (e.g. a fast path that handed its run
   * to the Workflow). An aborted call is ledgered at its estimated cost; later calls never start.
   */
  signal?: AbortSignal;
};

type CallResult = { ok: true; raw: unknown; text: string; tokensIn: number; tokensOut: number; costUsd: number; ms: number } | { ok: false; error: string; text: string | null; tokensIn: number; tokensOut: number; costUsd: number; ms: number; kind: 'http' | 'timeout' | 'parse' };

export function zodIssues(err: unknown): string {
  const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues;
  if (Array.isArray(issues)) return issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  return err instanceof Error ? err.message : String(err);
}

export function createLlm(cfg: LlmConfig): LlmClient {
  const openrouter = createOpenRouter({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    headers: { 'X-Title': cfg.appName ?? 'Signal Loop', 'HTTP-Referer': 'https://repos.hunterborman.com/repo/invoca' },
    ...(cfg.fetch ? { fetch: cfg.fetch } : {}),
  });

  async function call(modelId: string, system: string, messages: ModelMessage[], req: LlmRequest<unknown>, timeoutMs: number): Promise<CallResult> {
    const t0 = Date.now();
    const model = openrouter.chat(modelId, {
      usage: { include: true },
      provider: { data_collection: 'deny', require_parameters: true, sort: 'throughput' },
      extraBody: { reasoning: { enabled: false } },
    });
    const anthropic = modelId.startsWith('anthropic/');
    try {
      const res = await generateText({
        model,
        system,
        messages,
        output: Output.object({ schema: jsonSchema<unknown>(req.jsonSchema as Parameters<typeof jsonSchema>[0]), name: req.schemaName }),
        maxOutputTokens: req.maxTokens,
        ...(anthropic ? {} : { temperature: 0 }),
        maxRetries: 0,
        abortSignal: cfg.signal ? AbortSignal.any([cfg.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
      const usage = (res.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined)?.usage;
      const tokensIn = res.usage.inputTokens ?? 0;
      const tokensOut = res.usage.outputTokens ?? 0;
      return { ok: true, raw: res.output, text: res.text, tokensIn, tokensOut, costUsd: typeof usage?.cost === 'number' ? usage.cost : estimateCost(modelId, tokensIn, tokensOut), ms: Date.now() - t0 };
    } catch (err) {
      const ms = Date.now() - t0;
      if (NoObjectGeneratedError.isInstance(err)) {
        const tokensIn = err.usage?.inputTokens ?? 0;
        const tokensOut = err.usage?.outputTokens ?? 0;
        return { ok: false, kind: 'parse', error: `output was not valid JSON: ${err.message.slice(0, 160)}`, text: err.text ?? null, tokensIn, tokensOut, costUsd: estimateCost(modelId, tokensIn, tokensOut), ms };
      }
      const msg = err instanceof Error ? err.message : String(err);
      const aborted = !!cfg.signal?.aborted;
      const timeout = aborted || /abort|timeout|timed out/i.test(msg) || (err as { name?: string })?.name === 'TimeoutError';
      const status = (err as { statusCode?: number }).statusCode;
      if (timeout) {
        // The provider may still finish (and bill) a request we stopped waiting for: ledger the
        // worst case for this call (its input plus max output) rather than nothing.
        const inChars = system.length + messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
        const tokensIn = estimateTokens(inChars);
        const tokensOut = req.maxTokens;
        const why = aborted ? 'aborted (run handed off)' : `timeout after ${timeoutMs}ms`;
        return { ok: false, kind: 'timeout', error: `${why}; cost estimated`, text: null, tokensIn, tokensOut, costUsd: estimateCost(modelId, tokensIn, tokensOut), ms };
      }
      return { ok: false, kind: 'http', error: `${status ? `HTTP ${status}: ` : ''}${msg.slice(0, 200)}`, text: null, tokensIn: 0, tokensOut: 0, costUsd: 0, ms };
    }
  }

  return {
    async structured<T>(req: LlmRequest<T>): Promise<{ data: T; meta: LlmMeta }> {
      const meta: LlmMeta = { model: cfg.primary, tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0, attempts: 0, fellBack: false, schemaRetried: false, errors: [] };
      const ledger = async (model: string, r: CallResult, attempt: number, error: string | null) => {
        meta.tokensIn += r.tokensIn;
        meta.tokensOut += r.tokensOut;
        meta.costUsd += r.costUsd;
        meta.ms += r.ms;
        meta.attempts++;
        const row: LlmCallRow = {
          id: `aic_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`, runId: req.runId, purpose: req.purpose, model, tokensIn: r.tokensIn, tokensOut: r.tokensOut,
          costUsd: r.costUsd, ms: r.ms, ok: !error, error, attempt, fallback: attempt === 3, schemaRetry: attempt === 2, createdAt: new Date().toISOString(),
        };
        try {
          await cfg.onCall?.(row);
        } catch {
          /* the ledger must never break the call path */
        }
      };
      const validate = (raw: unknown): { ok: true; data: T } | { ok: false; error: string } => {
        const parsed = req.schema.safeParse(req.repair ? req.repair(raw) : raw);
        return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: zodIssues(parsed.error) };
      };
      const base: ModelMessage[] = [{ role: 'user', content: req.prompt }];
      const stopIfAborted = () => {
        if (cfg.signal?.aborted) throw new LlmFailure(`${req.purpose} aborted: the run was handed off`, { ...meta, errors: [...meta.errors, 'aborted'] });
      };

      // 1. primary
      stopIfAborted();
      const r1 = await call(cfg.primary, req.system, base, req as LlmRequest<unknown>, cfg.primaryTimeoutMs ?? 12_000);
      let v1: ReturnType<typeof validate> | null = null;
      if (r1.ok) {
        v1 = validate(r1.raw);
        await ledger(cfg.primary, r1, 1, v1.ok ? null : `schema: ${v1.error}`);
        if (v1.ok) return { data: v1.data, meta: { ...meta, model: cfg.primary } };
        meta.errors.push(`primary schema: ${v1.error}`);
      } else {
        await ledger(cfg.primary, r1, 1, r1.error);
        meta.errors.push(`primary ${r1.kind}: ${r1.error}`);
      }

      // 2. schema retry on the primary, with the validation errors fed back
      const invalidOutput = (r1.ok && v1 && !v1.ok) || (!r1.ok && r1.kind === 'parse');
      if (invalidOutput) {
        meta.schemaRetried = true;
        const prior = r1.ok ? r1.text || JSON.stringify(r1.raw) : r1.text ?? '';
        const why = r1.ok && v1 && !v1.ok ? v1.error : !r1.ok ? r1.error : '';
        const retryMsgs: ModelMessage[] = [
          ...base,
          { role: 'assistant', content: prior.slice(0, 6000) || '(empty)' },
          { role: 'user', content: `Your previous output failed validation: ${why}\nReturn corrected JSON only, matching the schema exactly.` },
        ];
        stopIfAborted();
        const r2 = await call(cfg.primary, req.system, retryMsgs, req as LlmRequest<unknown>, cfg.primaryTimeoutMs ?? 12_000);
        if (r2.ok) {
          const v2 = validate(r2.raw);
          await ledger(cfg.primary, r2, 2, v2.ok ? null : `schema: ${v2.error}`);
          if (v2.ok) return { data: v2.data, meta: { ...meta, model: cfg.primary } };
          meta.errors.push(`primary retry schema: ${v2.error}`);
        } else {
          await ledger(cfg.primary, r2, 2, r2.error);
          meta.errors.push(`primary retry ${r2.kind}: ${r2.error}`);
        }
      }

      // 3. secondary model
      stopIfAborted();
      meta.fellBack = true;
      const r3 = await call(cfg.secondary, req.system, base, req as LlmRequest<unknown>, cfg.secondaryTimeoutMs ?? 20_000);
      if (r3.ok) {
        const v3 = validate(r3.raw);
        await ledger(cfg.secondary, r3, 3, v3.ok ? null : `schema: ${v3.error}`);
        if (v3.ok) return { data: v3.data, meta: { ...meta, model: cfg.secondary } };
        meta.errors.push(`secondary schema: ${v3.error}`);
      } else {
        await ledger(cfg.secondary, r3, 3, r3.error);
        meta.errors.push(`secondary ${r3.kind}: ${r3.error}`);
      }
      throw new LlmFailure(`${req.purpose} failed on both models: ${meta.errors[meta.errors.length - 1] ?? 'unknown error'}`, { ...meta, model: cfg.secondary });
    },
  };
}
