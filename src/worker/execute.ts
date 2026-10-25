/**
 * How a live run executes: a fast path first, the durable Workflow as the fallback.
 *
 *   POST /runs ──▶ ctx.waitUntil(fastPath)        same runPipeline core, same run_steps rows,
 *                    │                              same telemetry; D1 writes coalesced through
 *                    │                              one WriteQueue (db.batch), screen ∥ extract,
 *                    │                              theme names generated after the run
 *                    ├─ finished ─▶ finalizeRun
 *                    └─ a step threw, or the budget (FAST_PATH_BUDGET_MS) ran out
 *                         ─▶ PipelineWorkflow.create({ resume: completed step results })
 *                            the Workflow skips the completed steps and runs the rest under
 *                            step.do (retries, backoff, timeouts). Step writes are upserts
 *                            keyed by (run, step) and by entity id, so a resumed step is
 *                            idempotent.
 *
 * A fast path that dies silently (isolate evicted) is picked up on read: see recoverStalled
 * in runs.ts, which hands the run to the Workflow from the start.
 */
import type { RunStep, StepKey } from '../shared/contracts.ts';
import { MINUTES_SAVED_PER_CALL } from '../shared/scoring.ts';
import { fallbackThemeName, repairThemeNames, THEME_NAME_JSON_SCHEMA, THEME_NAME_SYSTEM, ThemeNameOutput, themeNamePrompt } from '../shared/prompts/themeName.ts';
import { errorMessage, runPatch, runPipeline } from '../pipeline/run.ts';
import type { LlmClient, PipelineInput, PipelineResult, ThemeNamingJob } from '../pipeline/types.ts';
import { settle } from './budget.ts';
import { getRawContent, getRunRow, j, nowIso, stepStatement, updateRunRow, updateRunStatement, type RunRow } from './db.ts';
import { RunSuperseded, upsertThemeVectors, workerDeps } from './deps.ts';
import type { Env } from './env.ts';
import type { Reporter } from './platform/sdk.ts';
import { loadContext, type RunContext } from './runs.ts';
import { newSpanId, pipelineTelemetry, signalReporter, type TraceCtx } from './telemetry.ts';
import { WriteQueue } from './writeQueue.ts';

/** How long the fast path may take before the Workflow takes over (well inside waitUntil's 30s). */
export const FAST_PATH_BUDGET_MS = 18_000;
/** Workflow params are capped (~1 MiB); above this the Workflow restarts from the first step. */
const MAX_RESUME_BYTES = 700_000;

export type StepCache = [StepKey, unknown][];
export type PipelineParams = {
  runId: string;
  workspaceId: string;
  /** Results of steps the fast path completed (the Workflow skips them). */
  resume?: StepCache;
  handoff?: { at: StepKey; reason: 'error' | 'budget' | 'stalled'; error: string | null };
};

export type LoadedRun = {
  run: { filename: string; fileId: string | null; format: string | null; createdAt: string };
  content: string;
  ctx: RunContext;
};

/** The run, its raw bytes and its context. `preload` (from run creation) skips two reads. */
export async function loadRun(env: Env, runId: string, workspaceId: string, preload?: { run: RunRow; content: string }): Promise<LoadedRun | null> {
  const run = preload?.run ?? (await getRunRow(env.DB, runId));
  if (!run || run.mode !== 'live') return null;
  const [content, ctx] = await Promise.all([preload ? preload.content : getRawContent(env.DB, run.sha256), loadContext(env, workspaceId, run.accountId)]);
  if (content === null) throw new Error('raw file missing');
  return { run: { filename: run.filename, fileId: run.fileId, format: run.format, createdAt: run.createdAt }, content, ctx };
}

export function pipelineInput(runId: string, workspaceId: string, l: LoadedRun): PipelineInput {
  return {
    runId, workspaceId, fileId: l.run.fileId, filename: l.run.filename, content: l.content, formatHint: (l.run.format as never) ?? null,
    promptVersion: l.ctx.promptVersion, account: l.ctx.account, people: l.ctx.people, accounts: l.ctx.accounts, rules: l.ctx.rules, taxonomy: l.ctx.taxonomy,
  };
}

/** Final run patch, budget settle, and the run-level span / log / work unit. */
export async function finalizeRun(
  env: Env,
  o: { runId: string; workspaceId: string; loaded: LoadedRun; result: PipelineResult; rep: Reporter; rootSpan: string; executor: 'fast_path' | 'workflow'; handoff?: PipelineParams['handoff']; queue?: WriteQueue },
): Promise<boolean> {
  const { runId, workspaceId, loaded, result, rep, rootSpan } = o;
  const startedMs = Date.parse(loaded.run.createdAt);
  const patch = runPatch(result, nowIso());
  // Wall-clock duration from creation (what the viewer waited), not just step time.
  patch.durationMs = Math.max(Number(patch.durationMs ?? 0), Date.now() - startedMs);
  let changed: number;
  if (o.queue) {
    // The final patch rides the same batch as the last step rows: one round trip.
    o.queue.push(updateRunStatement(env.DB, runId, patch, { onlyIfLive: true }));
    await o.queue.drain();
    changed = o.queue.superseded ? 0 : 1;
  } else {
    changed = await updateRunRow(env.DB, runId, patch, { onlyIfLive: true });
  }
  await settle(env, runId);
  if (changed) {
    const fields = { status: result.status, costUsd: result.costUsd, insights: patch.insightCount, dropped: patch.droppedCount, review: patch.reviewCount, executor: o.executor, ...(o.handoff ? { handoffAt: o.handoff.at, handoffReason: o.handoff.reason } : {}) };
    rep.span({ traceId: runId, spanId: rootSpan, parentId: null, name: 'run', start: loaded.run.createdAt, durationMs: Number(patch.durationMs), status: result.status === 'failed' ? 'error' : 'ok', attrs: { ...fields, fileId: loaded.run.fileId } });
    rep.log({ level: result.status === 'failed' ? 'error' : 'info', component: 'workflow', event: 'run.finished', message: `run ${result.status} via ${o.executor === 'fast_path' ? 'fast path' : 'durable workflow'}${result.error ? `: ${result.error}` : ''}`, traceId: runId, spanId: rootSpan, runId, workspaceId, durationMs: Number(patch.durationMs), fields });
    rep.work({ kind: 'call_processed', actorId: `viewer:${workspaceId.replace(/^ws_/, '').slice(0, 6)}`, minutesSavedEstimate: result.status === 'failed' ? 0 : MINUTES_SAVED_PER_CALL, humanMinutesSpent: 0, aiCostUsd: result.costUsd, outcome: result.status === 'failed' ? 'failed' : 'automatic' });
  }
  return changed > 0;
}

class HandOff extends Error {
  constructor(key: StepKey) {
    super(`fast path handed ${key} to the workflow`);
    this.name = 'HandOff';
  }
}

const TIMEOUT = Symbol('timeout');
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<typeof TIMEOUT>((r) => (timer = setTimeout(() => r(TIMEOUT), ms)))]).finally(() => clearTimeout(timer));
}

/**
 * Run the pipeline now, inside the request's waitUntil. Returns how it ended (for tests/logs).
 */
export async function fastPath(env: Env, runId: string, workspaceId: string, preload?: { run: RunRow; content: string }): Promise<'finished' | 'handed_off' | 'superseded' | 'failed'> {
  const t0 = Date.now();
  const budgetMs = Number(env.FAST_PATH_BUDGET_MS ?? '') || FAST_PATH_BUDGET_MS;
  const deadline = t0 + budgetMs;
  const rep = signalReporter(env);
  const rootSpan = newSpanId();
  const trace: TraceCtx = { rep, traceId: runId, parentId: rootSpan, runId, workspaceId };
  const tel = pipelineTelemetry(trace);
  const queue = new WriteQueue(env.DB, runId, { guardLive: true });
  const flushes: Promise<void>[] = [];
  try {
    const loaded = await loadRun(env, runId, workspaceId, preload);
    if (!loaded) return 'superseded';
    const deps = workerDeps(env, { runId, workspaceId, trace, queue });
    deps.telemetry = tel;
    deps.speculativeExtract = true;
    const naming: ThemeNamingJob[] = [];
    deps.deferThemeNaming = (job) => naming.push(job);

    // Once a step is abandoned (budget), nothing it does later may write.
    let abandoned = false;
    const store = deps.store;
    deps.store = new Proxy(store, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        return typeof v === 'function' ? (...args: unknown[]) => (abandoned ? Promise.resolve() : (v as (...a: unknown[]) => unknown).apply(target, args)) : v;
      },
    });
    // A failed step row is held back: the Workflow retries that step and overwrites the row.
    const heldFailures: RunStep[] = [];
    const writeStep = deps.onStep!;
    deps.onStep = (row) => {
      if (abandoned) return;
      if (row.status === 'failed') {
        heldFailures.push(row);
        return;
      }
      return writeStep(row);
    };

    const cache: StepCache = [];
    let handoff = null as PipelineParams['handoff'] | null;
    deps.runStep = async <T>(key: StepKey, fn: () => Promise<T>): Promise<T> => {
      if (queue.superseded) throw new RunSuperseded(runId);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        handoff = { at: key, reason: 'budget', error: null };
        throw new HandOff(key);
      }
      trace.parentId = tel.stepSpan(key);
      try {
        const p = fn();
        const out = await withTimeout(p, remaining);
        if (out === TIMEOUT) {
          abandoned = true;
          p.catch(() => {});
          handoff = { at: key, reason: 'budget', error: `step exceeded the ${budgetMs}ms fast-path budget` };
          throw new HandOff(key);
        }
        cache.push([key, out]);
        return out;
      } catch (err) {
        if (err instanceof HandOff || err instanceof RunSuperseded) throw err;
        handoff = { at: key, reason: 'error', error: errorMessage(err).slice(0, 300) };
        throw err;
      } finally {
        trace.parentId = rootSpan;
        flushes.push(rep.flush());
      }
    };

    const result = await runPipeline(pipelineInput(runId, workspaceId, loaded), deps);
    if (queue.superseded || (result.error && /no longer live/.test(result.error))) return 'superseded';

    if (handoff) {
      const h: NonNullable<PipelineParams['handoff']> = handoff;
      await queue.drain();
      const resume = JSON.stringify(cache).length <= MAX_RESUME_BYTES ? cache : undefined;
      rep.log({ level: 'warn', component: 'workflow', event: 'run.handoff', message: `fast path handed the run to the durable workflow at ${h.at} (${h.reason}${h.error ? `: ${h.error}` : ''})`, traceId: runId, spanId: rootSpan, runId, workspaceId, durationMs: Date.now() - t0, fields: { at: h.at, reason: h.reason, completedSteps: cache.length, resumed: !!resume } });
      try {
        const params: PipelineParams = { runId, workspaceId, ...(resume ? { resume } : {}), handoff: h };
        const instance = await env.PIPELINE.create({ id: runId, params });
        await updateRunRow(env.DB, runId, { workflowId: instance.id });
        return 'handed_off';
      } catch (err) {
        rep.log({ level: 'error', component: 'workflow', event: 'workflow.create_failed', message: String(err).slice(0, 200), traceId: runId, spanId: rootSpan, runId, workspaceId, durationMs: null, fields: {} });
        // No durable path available: the run fails here, with its failed step row.
        for (const row of heldFailures) queue.push(stepStatement(env.DB, row));
        await queue.drain();
        await finalizeRun(env, { runId, workspaceId, loaded, result: { ...result, status: 'failed', error: result.error ?? h.error ?? 'fast path failed' }, rep, rootSpan, executor: 'fast_path', handoff: h });
        return 'failed';
      }
    }

    await finalizeRun(env, { runId, workspaceId, loaded, result, rep, rootSpan, executor: 'fast_path', queue });
    // After the viewer has the result: name the run's new candidate themes (one batched call).
    if (naming.length) {
      trace.parentId = tel.stepSpan('theme');
      await nameThemes(env, deps.llm, runId, naming, queue, rep);
    }
    return result.status === 'failed' ? 'failed' : 'finished';
  } catch (err) {
    rep.log({ level: 'error', component: 'workflow', event: 'fast_path.crashed', message: errorMessage(err).slice(0, 300), traceId: runId, spanId: rootSpan, runId, workspaceId, durationMs: Date.now() - t0, fields: {} });
    try {
      await updateRunRow(env.DB, runId, { status: 'failed', error: 'the pipeline could not run' }, { onlyIfLive: true });
      await settle(env, runId);
    } catch {
      /* the read-time fallback will pick it up */
    }
    return 'failed';
  } finally {
    await Promise.allSettled(flushes);
    await rep.flush();
  }
}

/**
 * Name candidate themes with one LLM call, then rename the themes (D1 + Vectorize metadata),
 * patch the theme step's detail, and add the call's cost to the theme step and the run.
 */
export async function nameThemes(env: Env, llm: LlmClient, runId: string, jobs: ThemeNamingJob[], queue: WriteQueue, rep: Reporter): Promise<void> {
  const clusters = jobs.flatMap((jb) => jb.clusters);
  if (!clusters.length) return;
  const db = env.DB;
  try {
    const r = await llm.structured({
      purpose: 'theme_name', system: THEME_NAME_SYSTEM, prompt: themeNamePrompt(clusters), schema: ThemeNameOutput, jsonSchema: THEME_NAME_JSON_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'themes', maxTokens: 600, runId, repair: repairThemeNames,
    });
    const byKey = new Map(r.data.themes.map((t) => [t.key, t]));
    const renamed = clusters.flatMap((c) => {
      const nm = byKey.get(c.key);
      return nm ? [{ ...c, name: nm.name, summary: nm.summary }] : [];
    });
    const stmts: D1PreparedStatement[] = renamed.map((c) => db.prepare('UPDATE themes SET name = ?, summary = ? WHERE id = ?').bind(c.name, c.summary, c.themeId));
    const step = await db.prepare("SELECT detail, cost_usd, tokens_in, tokens_out FROM run_steps WHERE run_id = ? AND key = 'theme'").bind(runId).first<{ detail: string | null; cost_usd: number | null; tokens_in: number | null; tokens_out: number | null }>();
    if (step) {
      const detail = j<{ assignments?: { themeId: string | null; name: string | null }[] } & Record<string, unknown>>(step.detail, {});
      const names = new Map(renamed.map((c) => [c.themeId, c.name]));
      const assignments = (detail.assignments ?? []).map((a) => (a.themeId && names.has(a.themeId) ? { ...a, name: names.get(a.themeId)! } : a));
      stmts.push(
        db
          .prepare("UPDATE run_steps SET detail = ?, model = COALESCE(model, ?), tokens_in = COALESCE(tokens_in, 0) + ?, tokens_out = COALESCE(tokens_out, 0) + ?, cost_usd = COALESCE(cost_usd, 0) + ? WHERE run_id = ? AND key = 'theme'")
          .bind(JSON.stringify({ ...detail, assignments, namingDeferred: true, namingMs: r.meta.ms }), r.meta.model, r.meta.tokensIn, r.meta.tokensOut, r.meta.costUsd, runId),
      );
    }
    stmts.push(db.prepare('UPDATE runs SET cost_usd = cost_usd + ? WHERE id = ?').bind(r.meta.costUsd, runId));
    queue.push(...stmts);
    queue.track(upsertThemeVectors(env, renamed.map((c) => ({ id: c.themeId, vector: c.vector, workspaceId: c.workspaceId, type: c.type as never, productArea: c.productArea as never, name: c.name }))));
    await queue.drain();
    rep.log({ level: 'info', component: 'workflow', event: 'theme.named', message: `named ${renamed.length} candidate theme${renamed.length === 1 ? '' : 's'} after the run`, traceId: runId, spanId: null, runId, workspaceId: clusters[0]!.workspaceId, durationMs: r.meta.ms, fields: { themes: renamed.length, costUsd: r.meta.costUsd } });
  } catch (err) {
    // The deterministic fallback names stay; the ledger already has the failed call.
    await queue.drain().catch(() => {});
    rep.log({ level: 'warn', component: 'workflow', event: 'theme.naming_failed', message: `theme naming failed; keeping fallback names (${errorMessage(err).slice(0, 120)})`, traceId: runId, spanId: null, runId, workspaceId: clusters[0]!.workspaceId, durationMs: null, fields: { fallback: clusters.map((c) => fallbackThemeName(c.summaries[0] ?? '')).length } });
  }
}
