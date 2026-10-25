import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { StepKey } from '../shared/contracts.ts';
import { MINUTES_SAVED_PER_CALL } from '../shared/scoring.ts';
import { runPatch, runPipeline } from '../pipeline/run.ts';
import { settle } from './budget.ts';
import { getRawContent, getRunRow, nowIso, updateRunRow } from './db.ts';
import { RunSuperseded, workerDeps } from './deps.ts';
import type { Env } from './env.ts';
import { loadContext } from './runs.ts';
import { newSpanId, pipelineTelemetry, signalReporter, type TraceCtx } from './telemetry.ts';

export type PipelineParams = { runId: string; workspaceId: string };

const LLM_STEPS = new Set<string>(['screen', 'extract', 'theme']);

function stepConfig(key: string): WorkflowStepConfig {
  return LLM_STEPS.has(key)
    ? { retries: { limit: 1, delay: '1 second', backoff: 'constant' }, timeout: '90 seconds' }
    : { retries: { limit: 2, delay: 500, backoff: 'exponential' }, timeout: '30 seconds' };
}

/**
 * The 10-step Signal Loop pipeline as a durable Workflow. Each pipeline step runs inside
 * step.do (retries, backoff, timeout) and writes its run_steps row, so the UI animates from
 * real rows. Items gated to review stay pending; the review API approves them synchronously.
 */
export class PipelineWorkflow extends WorkflowEntrypoint<Env, PipelineParams> {
  override async run(event: WorkflowEvent<PipelineParams>, step: WorkflowStep): Promise<void> {
    const { runId, workspaceId } = event.payload;
    const env = this.env;

    const loaded = await step.do('load', stepConfig('load'), async () => {
      const run = await getRunRow(env.DB, runId);
      if (!run || run.mode !== 'live') return null;
      const content = await getRawContent(env.DB, run.sha256);
      if (content === null) throw new NonRetryableError('raw file missing');
      const ctx = await loadContext(env, workspaceId, run.accountId);
      return { run: { filename: run.filename, fileId: run.fileId, format: run.format, createdAt: run.createdAt }, content, ctx };
    });
    if (!loaded) return;

    const rep = signalReporter(env);
    const rootSpan = newSpanId();
    const trace: TraceCtx = { rep, traceId: runId, parentId: rootSpan, runId, workspaceId };
    const tel = pipelineTelemetry(trace);
    const deps = workerDeps(env, { runId, workspaceId, trace });
    deps.telemetry = tel;
    deps.runStep = async <T>(key: StepKey, fn: () => Promise<T>): Promise<T> => {
      const out = await step.do(key, stepConfig(key), async () => {
        try {
          // Child spans (AI calls, deliveries) hang off this step's span.
          trace.parentId = tel.stepSpan(key);
          return (await fn()) as never;
        } catch (err) {
          if (err instanceof RunSuperseded) throw new NonRetryableError(err.message);
          throw err;
        } finally {
          trace.parentId = rootSpan;
          await rep.flush();
        }
      });
      return out as T;
    };

    let result;
    try {
      result = await runPipeline(
        {
          runId, workspaceId, fileId: loaded.run.fileId, filename: loaded.run.filename, content: loaded.content, formatHint: (loaded.run.format as never) ?? null,
          promptVersion: loaded.ctx.promptVersion, account: loaded.ctx.account, people: loaded.ctx.people, accounts: loaded.ctx.accounts, rules: loaded.ctx.rules, taxonomy: loaded.ctx.taxonomy,
        },
        deps,
      );
    } catch (err) {
      // Superseded runs end quietly; the replay owns the run now.
      if (String(err).includes('no longer live')) return;
      throw err;
    }
    if (result.error && /no longer live/.test(result.error)) return;

    await step.do('finalize', stepConfig('finalize'), async () => {
      const startedMs = Date.parse(loaded.run.createdAt);
      const patch = runPatch(result, nowIso());
      // Wall-clock duration from creation (what the viewer waited), not just step time.
      patch.durationMs = Math.max(Number(patch.durationMs ?? 0), Date.now() - startedMs);
      const changed = await updateRunRow(env.DB, runId, patch, { onlyIfLive: true });
      await settle(env, runId);
      if (changed) {
        rep.span({ traceId: runId, spanId: rootSpan, parentId: null, name: 'run', start: loaded.run.createdAt, durationMs: Number(patch.durationMs), status: result.status === 'failed' ? 'error' : 'ok', attrs: { status: result.status, costUsd: result.costUsd, insights: patch.insightCount, fileId: loaded.run.fileId } });
        rep.log({ level: result.status === 'failed' ? 'error' : 'info', component: 'workflow', event: 'run.finished', message: `run ${result.status}${result.error ? `: ${result.error}` : ''}`, traceId: runId, spanId: rootSpan, runId, workspaceId, durationMs: Number(patch.durationMs), fields: { status: result.status, costUsd: result.costUsd, insights: patch.insightCount, dropped: patch.droppedCount, review: patch.reviewCount } });
        rep.work({ kind: 'call_processed', actorId: `viewer:${workspaceId.replace(/^ws_/, '').slice(0, 6)}`, minutesSavedEstimate: result.status === 'failed' ? 0 : MINUTES_SAVED_PER_CALL, humanMinutesSpent: 0, aiCostUsd: result.costUsd, outcome: result.status === 'failed' ? 'failed' : 'automatic' });
      }
      await rep.flush();
      return { status: result.status };
    });
  }
}
