import { describe, expect, it } from 'vitest';
import { acceptsTemperature, createLlm, reasoningFor } from '../../../src/worker/ai.ts';
import { ScreenOutput } from '../../../src/shared/contracts.ts';
import { SCREEN_JSON_SCHEMA } from '../../../src/shared/prompts/screen.ts';
import { LlmFailure, type LlmCallRow } from '../../../src/pipeline/types.ts';

const GOOD = { actionable: true, language: 'en', injection_suspected: false, injection_excerpt: null, call_kind: 'qbr', reason: 'ok' };
type Plan = (body: any, n: number) => { status: number; content?: string; delayMs?: number };

function fakeFetch(plan: Plan) {
  const bodies: any[] = [];
  const f = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    const p = plan(body, bodies.length);
    if (p.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, p.delayMs);
        init?.signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))));
      });
    }
    if (p.status !== 200) return new Response(JSON.stringify({ error: { message: 'upstream', code: p.status } }), { status: p.status, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ id: 'g', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: p.content ?? JSON.stringify(GOOD) }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.00012 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, bodies };
}

function client(plan: Plan, timeouts = {}) {
  const { f, bodies } = fakeFetch(plan);
  const rows: LlmCallRow[] = [];
  const llm = createLlm({ apiKey: 'k', primary: 'deepseek/deepseek-v4.1-flash', secondary: 'anthropic/claude-haiku-5.5', fetch: f, onCall: (r) => void rows.push(r), ...timeouts });
  const req = { purpose: 'screen' as const, system: 'sys', prompt: 'user text', schema: ScreenOutput, jsonSchema: SCREEN_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: 'screen', maxTokens: 300, runId: 'run_1' };
  return { llm, rows, bodies, req };
}

describe('createLlm (AI SDK + OpenRouter provider)', () => {
  it('sends provider routing, usage accounting, reasoning off and strict json_schema; records cost', async () => {
    const { llm, rows, bodies, req } = client(() => ({ status: 200 }));
    const r = await llm.structured(req);
    expect(r.data).toEqual(GOOD);
    expect(r.meta).toMatchObject({ model: 'deepseek/deepseek-v4.1-flash', attempts: 1, fellBack: false, schemaRetried: false, tokensIn: 100, tokensOut: 20 });
    expect(r.meta.costUsd).toBeCloseTo(0.00012);
    const b = bodies[0];
    expect(b.provider).toEqual({ data_collection: 'deny', require_parameters: true, sort: 'throughput' });
    expect(b.usage).toEqual({ include: true });
    expect(b.reasoning).toEqual({ enabled: false });
    expect(b.temperature).toBe(0);
    expect(b.response_format.type).toBe('json_schema');
    expect(b.response_format.json_schema).toMatchObject({ name: 'screen', strict: true });
    expect(b.messages[0].role).toBe('system');
    expect(JSON.stringify(b.messages[0].content)).toContain('sys');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ok: true, attempt: 1, runId: 'run_1', purpose: 'screen', fallback: false });
  });

  it('retries once on the primary with the validation errors fed back', async () => {
    const { llm, rows, bodies, req } = client((_b, n) => (n === 1 ? { status: 200, content: JSON.stringify({ ...GOOD, call_kind: 'party' }) } : { status: 200 }));
    const r = await llm.structured(req);
    expect(r.meta.schemaRetried).toBe(true);
    expect(r.meta.fellBack).toBe(false);
    expect(bodies[1].messages.at(-1).content).toContain('failed validation');
    expect(bodies[1].messages.at(-1).content).toContain('call_kind');
    expect(rows.map((x) => [x.attempt, x.ok])).toEqual([[1, false], [2, true]]);
    expect(rows[0]!.error).toMatch(/^schema:/);
  });

  it('falls back to the secondary on primary HTTP errors, omitting temperature for Anthropic', async () => {
    const { llm, rows, bodies, req } = client((b) => (b.model.startsWith('deepseek/') ? { status: 503 } : { status: 200 }));
    const r = await llm.structured(req);
    expect(r.meta).toMatchObject({ model: 'anthropic/claude-haiku-5.5', fellBack: true, attempts: 2 });
    expect(bodies[1].model).toBe('anthropic/claude-haiku-5.5');
    expect('temperature' in bodies[1]).toBe(false);
    expect(rows.map((x) => [x.model, x.ok, x.fallback])).toEqual([['deepseek/deepseek-v4.1-flash', false, false], ['anthropic/claude-haiku-5.5', true, true]]);
  });

  it('falls back on a primary timeout', async () => {
    const { llm, req } = client((b) => (b.model.startsWith('deepseek/') ? { status: 200, delayMs: 2000 } : { status: 200 }), { primaryTimeoutMs: 100 });
    const r = await llm.structured(req);
    expect(r.meta.fellBack).toBe(true);
    expect(r.meta.errors[0]).toMatch(/timeout/);
  });

  it('a timed-out call is ledgered at its estimated worst-case cost, not zero', async () => {
    const { llm, rows, req } = client((b) => (b.model.startsWith('deepseek/') ? { status: 200, delayMs: 2000 } : { status: 200 }), { primaryTimeoutMs: 100 });
    await llm.structured(req);
    const timedOut = rows.find((x) => x.attempt === 1)!;
    expect(timedOut.ok).toBe(false);
    expect(timedOut.error).toMatch(/timeout.*cost estimated/);
    expect(timedOut.tokensOut).toBe(req.maxTokens);
    expect(timedOut.costUsd).toBeGreaterThan(0);
  });

  it('an external abort stops the call, ledgers its estimate, and never starts another attempt', async () => {
    const stop = new AbortController();
    const { f, bodies } = fakeFetch(() => ({ status: 200, delayMs: 2000 }));
    const rows: LlmCallRow[] = [];
    const llm = createLlm({ apiKey: 'k', primary: 'deepseek/deepseek-v4.1-flash', secondary: 'anthropic/claude-haiku-5.5', fetch: f, onCall: (r) => void rows.push(r), signal: stop.signal });
    const req = { purpose: 'screen' as const, system: 'sys', prompt: 'user text', schema: ScreenOutput, jsonSchema: SCREEN_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: 'screen', maxTokens: 300, runId: 'run_1' };
    const p = llm.structured(req);
    setTimeout(() => stop.abort(), 50);
    await expect(p).rejects.toBeInstanceOf(LlmFailure);
    expect(bodies).toHaveLength(1); // no retry, no secondary
    expect(rows).toHaveLength(1);
    expect(rows[0]!.error).toMatch(/aborted/);
    expect(rows[0]!.costUsd).toBeGreaterThan(0);
    await expect(llm.structured(req)).rejects.toBeInstanceOf(LlmFailure);
    expect(bodies).toHaveLength(1);
  });

  it('non-JSON output counts as invalid and is retried', async () => {
    const { llm, req } = client((_b, n) => (n === 1 ? { status: 200, content: 'not json at all' } : { status: 200 }));
    const r = await llm.structured(req);
    expect(r.meta.schemaRetried).toBe(true);
  });

  it('throws LlmFailure (for the DLQ) when everything fails, with every call in the ledger', async () => {
    const { llm, rows, req } = client(() => ({ status: 500 }));
    await expect(llm.structured(req)).rejects.toBeInstanceOf(LlmFailure);
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => !x.ok)).toBe(true);
    try {
      await llm.structured(req);
    } catch (e) {
      expect((e as LlmFailure).meta.errors.length).toBe(2);
      expect((e as LlmFailure).message).toContain('failed on both models');
    }
  });

  it('a ledger sink that throws never breaks the call', async () => {
    const { f } = fakeFetch(() => ({ status: 200 }));
    const llm = createLlm({ apiKey: 'k', primary: 'deepseek/deepseek-v4.1-flash', secondary: 'anthropic/claude-haiku-5.5', fetch: f, onCall: () => { throw new Error('db down'); } });
    const r = await llm.structured({ purpose: 'screen', system: 's', prompt: 'p', schema: ScreenOutput, jsonSchema: SCREEN_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: 'screen', maxTokens: 100, runId: null });
    expect(r.data.actionable).toBe(true);
  });
});

describe('decision tier', () => {
  const DECISION = 'z-ai/glm-5.3-flash';
  function decisionClient(plan: Plan, extra: Record<string, unknown> = {}) {
    const { f, bodies } = fakeFetch(plan);
    const rows: LlmCallRow[] = [];
    const llm = createLlm({ apiKey: 'k', primary: 'deepseek/deepseek-v4.1-flash', secondary: 'anthropic/claude-haiku-5.5', decision: DECISION, fetch: f, onCall: (r) => void rows.push(r), ...extra });
    const req = { purpose: 'screen' as const, tier: 'decision' as const, system: 'sys', prompt: 'user text', schema: ScreenOutput, jsonSchema: SCREEN_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: 'screen', maxTokens: 300, runId: 'run_1' };
    return { llm, rows, bodies, req };
  }

  it('uses the decision model, sorted by latency, with the usual privacy routing', async () => {
    const { llm, rows, bodies, req } = decisionClient(() => ({ status: 200 }));
    const r = await llm.structured(req);
    expect(r.meta).toMatchObject({ model: DECISION, attempts: 1, fellBack: false });
    expect(bodies[0].model).toBe(DECISION);
    expect(bodies[0].provider).toEqual({ data_collection: 'deny', require_parameters: true, sort: 'latency' });
    // Reasoning is mandatory on this family: the lowest effort, reasoning text excluded.
    expect(bodies[0].reasoning).toEqual({ effort: 'low', exclude: true });
    expect(rows).toEqual([expect.objectContaining({ model: DECISION, ok: true, attempt: 1, fallback: false })]);
  });

  it('falls back to the primary (never the secondary) when the decision model errors, and ledgers the model actually used', async () => {
    const { llm, rows, bodies, req } = decisionClient((b) => (b.model === DECISION ? { status: 503 } : { status: 200 }));
    const r = await llm.structured(req);
    expect(r.meta).toMatchObject({ model: 'deepseek/deepseek-v4.1-flash', fellBack: true, attempts: 2 });
    expect(bodies.map((b) => b.model)).toEqual([DECISION, 'deepseek/deepseek-v4.1-flash']);
    expect(bodies[1].provider.sort).toBe('throughput');
    expect(rows.map((x) => [x.model, x.ok, x.attempt, x.fallback])).toEqual([[DECISION, false, 1, false], ['deepseek/deepseek-v4.1-flash', true, 3, true]]);
  });

  it('falls back on invalid output and on a timeout (short decision timeout)', async () => {
    const bad = decisionClient((b) => (b.model === DECISION ? { status: 200, content: JSON.stringify({ ...GOOD, call_kind: 7 }) } : { status: 200 }));
    expect((await bad.llm.structured(bad.req)).meta.fellBack).toBe(true);
    const slow = decisionClient((b) => (b.model === DECISION ? { status: 200, delayMs: 2000 } : { status: 200 }), { decisionTimeoutMs: 100 });
    const r = await slow.llm.structured(slow.req);
    expect(r.meta.model).toBe('deepseek/deepseek-v4.1-flash');
    expect(r.meta.errors[0]).toMatch(/^decision timeout/);
  });

  it('when both fail it throws LlmFailure after two calls (the secondary is never tried)', async () => {
    const { llm, bodies, req } = decisionClient(() => ({ status: 500 }));
    await expect(llm.structured(req)).rejects.toBeInstanceOf(LlmFailure);
    expect(bodies.map((b) => b.model)).toEqual([DECISION, 'deepseek/deepseek-v4.1-flash']);
  });

  it('primary-tier calls are unchanged by a configured decision model', async () => {
    const { llm, bodies, req } = decisionClient(() => ({ status: 200 }));
    await llm.structured({ ...req, tier: 'primary' });
    expect(bodies[0].model).toBe('deepseek/deepseek-v4.1-flash');
    expect(bodies[0].provider.sort).toBe('throughput');
  });

  it('with no decision model, or the same model as the primary, decision calls use the primary chain', async () => {
    const same = decisionClient(() => ({ status: 200 }), { decision: 'deepseek/deepseek-v4.1-flash' });
    await same.llm.structured(same.req);
    expect(same.bodies[0].provider.sort).toBe('throughput');
    const none = decisionClient((b) => (b.model.startsWith('deepseek/') ? { status: 503 } : { status: 200 }), { decision: undefined });
    const r = await none.llm.structured(none.req);
    expect(r.meta.model).toBe('anthropic/claude-haiku-5.5');
  });

  it('model families: temperature and reasoning settings', () => {
    expect(acceptsTemperature('deepseek/deepseek-v4.1-flash')).toBe(true);
    expect(acceptsTemperature('anthropic/claude-haiku-5.5')).toBe(false);
    expect(acceptsTemperature('openai/gpt-5.4-nano')).toBe(false);
    expect(acceptsTemperature('openai/gpt-oss-20b')).toBe(true);
    expect(reasoningFor('deepseek/deepseek-v4.1-flash')).toEqual({ enabled: false });
    expect(reasoningFor('openai/gpt-oss-20b')).toEqual({ effort: 'low', exclude: true });
    expect(reasoningFor('openai/gpt-5.4-nano')).toEqual({ effort: 'minimal', exclude: true });
    expect(reasoningFor('inference-net/schematron-v2-turbo')).toBeNull();
  });
});
