import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { StepKey } from '../shared/contracts.ts';
import { runPipeline } from '../pipeline/run.ts';
import { RunSuperseded, workerDeps } from './deps.ts';
import type { Env } from './env.ts';
import { finalizeRun, loadRun, pipelineInput, type PipelineParams } from './execute.ts';
import { newSpanId, pipelineTelemetry, signalReporter, type TraceCtx } from './telemetry.ts';
import { WriteQueue } from './writeQueue.ts';

export type { PipelineParams };

const LLM_STEPS = new Set<string>(['screen', 'extract', 'theme']);

function stepConfig(key: string): WorkflowStepConfig {
  return LLM_STEPS.has(key)
    ? { retries: { limit: 1, delay: '1 second', backoff: 'constant' }, timeout: '90 seconds' }
    : { retries: { limit: 2, delay: 500, backoff: 'exponential' }, timeout: '30 seconds' };
}

/**
 * The durable path for the 10-step Signal Loop pipeline. Live runs start on the fast path
 * (execute.ts); this Workflow takes over when a fast-path step throws or the fast-path budget
 * runs out, resuming after the last completed step (`resume`), or from the start when a stalled
 * run is recovered. Each remaining step runs inside step.do (retries, backoff, timeout) and
 * commits its run_steps row and outputs before the step completes.
 */
export class PipelineWorkflow extends WorkflowEntrypoint<Env, PipelineParams> {
  override async run(event: WorkflowEvent<PipelineParams>, step: WorkflowStep): Promise<void> {
    const { runId, workspaceId } = event.payload;
    const resume = new Map<StepKey, unknown>(event.payload.resume ?? []);
    const env = this.env;

    const loaded = await step.do('load', stepConfig('load'), async () => {
      try {
        return await loadRun(env, runId, workspaceId);
      } catch (err) {
        throw new NonRetryableError(String(err));
      }
    });
    if (!loaded) return;

    const rep = signalReporter(env);
    const rootSpan = newSpanId();
    const trace: TraceCtx = { rep, traceId: runId, parentId: rootSpan, runId, workspaceId };
    const tel = pipelineTelemetry(trace);
    const queue = new WriteQueue(env.DB, runId, { guardLive: true });
    const deps = workerDeps(env, { runId, workspaceId, trace, queue });
    deps.telemetry = tel;
    deps.runStep = async <T>(key: StepKey, fn: () => Promise<T>): Promise<T> => {
      // Completed on the fast path: its rows are already committed.
      if (resume.has(key)) return resume.get(key) as T;
      const out = await step.do(key, stepConfig(key), async () => {
        try {
          if (queue.superseded) throw new RunSuperseded(runId);
          // Child spans (AI calls, deliveries) hang off this step's span.
          trace.parentId = tel.stepSpan(key);
          const r = (await fn()) as never;
          await queue.drain();
          if (queue.superseded) throw new RunSuperseded(runId);
          return r;
        } catch (err) {
          await queue.drain().catch(() => {});
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
      result = await runPipeline(pipelineInput(runId, workspaceId, loaded), deps);
    } catch (err) {
      // Superseded runs end quietly; the replay owns the run now.
      if (String(err).includes('no longer live')) return;
      throw err;
    }
    if (result.error && /no longer live/.test(result.error)) return;

    await step.do('finalize', stepConfig('finalize'), async () => {
      await finalizeRun(env, { runId, workspaceId, loaded, result, rep, rootSpan, executor: 'workflow', queue, ...(event.payload.handoff ? { handoff: event.payload.handoff } : {}) });
      await rep.flush();
      return { status: result.status };
    });
  }
}
