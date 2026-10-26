import { describe, expect, it } from 'vitest';
import { pipelineTelemetry, type TraceCtx } from '../../src/worker/telemetry.ts';
import type { RunStep } from '../../src/shared/contracts.ts';

type Span = { spanId: string; parentId: string | null; name: string };

describe('pipeline telemetry', () => {
  it('parents every step span on the run root, even after the executor repoints parentId at the step', () => {
    const spans: Span[] = [];
    const rep = { log() {}, span: (s: Span) => void spans.push(s), track() {}, work() {}, async flush() {} };
    const trace: TraceCtx = { rep: rep as unknown as TraceCtx['rep'], traceId: 'run_1', parentId: 'root', runId: 'run_1', workspaceId: 'ws' };
    const tel = pipelineTelemetry(trace);
    for (const key of ['screen', 'extract'] as const) {
      // What execute.ts and workflow.ts do around each step: AI calls nest under the step.
      trace.parentId = tel.stepSpan(key);
      const row: RunStep = { runId: 'run_1', key, status: 'passed', startedAt: '2026-10-26T00:00:00Z', finishedAt: '2026-10-26T00:00:01Z', durationMs: 1000, model: null, tokensIn: null, tokensOut: null, costUsd: null, summary: 'ok', detail: null };
      tel.stepFinished!(row);
    }
    expect(spans.map((s) => s.name)).toEqual(['step.screen', 'step.extract']);
    for (const s of spans) {
      expect(s.parentId).toBe('root');
      expect(s.parentId).not.toBe(s.spanId);
    }
  });
});
