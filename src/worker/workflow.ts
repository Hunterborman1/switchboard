import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { Env } from './env';

export type PipelineParams = { runId: string; workspaceId: string };

/** The 10-step Signal Loop pipeline (implemented in src/worker/pipeline). */
export class PipelineWorkflow extends WorkflowEntrypoint<Env, PipelineParams> {
  async run(event: WorkflowEvent<PipelineParams>, step: WorkflowStep): Promise<void> {
    await step.do('noop', async () => ({ runId: event.payload.runId }));
  }
}
