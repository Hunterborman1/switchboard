/**
 * Signal Loop → Agent Ops instrumentation. Everything goes through the platform SDK
 * (`reporter(env, SIGNAL_LOOP_AGENT_ID)`): structured logs (also mirrored to console JSON for
 * Workers Logs), spans and work units. Traces: one per HTTP request (x-trace-id) and one per
 * run (traceId = runId), with a span per step, AI call and delivery.
 */
import type { Delivery, RunStep, StepKey } from '../shared/contracts.ts';
import { SIGNAL_LOOP_AGENT_ID } from '../shared/platform-contracts.ts';
import type { LlmCallRow, PipelineTelemetry } from '../pipeline/types.ts';
import type { Env } from './env.ts';
import { reporter, type Reporter } from './platform/sdk.ts';

export function newSpanId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function newTraceId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function signalReporter(env: Env): Reporter {
  try {
    return reporter(env, SIGNAL_LOOP_AGENT_ID);
  } catch {
    return { log() {}, span() {}, track() {}, work() {}, async flush() {} };
  }
}

export type TraceCtx = { rep: Reporter; traceId: string; parentId: string | null; runId: string | null; workspaceId: string | null };

/** Ledger sink → `ai.call` log + span per HTTP call to a model. */
export function aiCallTelemetry(t: TraceCtx): (row: LlmCallRow) => void {
  return (row) => {
    const spanId = newSpanId();
    t.rep.span({
      traceId: t.traceId, spanId, parentId: t.parentId, name: `ai.generate ${row.model}`, start: new Date(Date.parse(row.createdAt) - row.ms).toISOString(), durationMs: row.ms,
      status: row.ok ? 'ok' : 'error',
      attrs: { model: row.model, purpose: row.purpose, tokensIn: row.tokensIn, tokensOut: row.tokensOut, costUsd: row.costUsd, attempt: row.attempt, fallback: row.fallback, schemaRetry: row.schemaRetry, ...(row.error ? { error: row.error } : {}) },
    });
    t.rep.log({
      level: row.ok ? 'info' : 'warn', component: 'ai', event: 'ai.call',
      message: `${row.purpose} via ${row.model}${row.ok ? '' : ` failed: ${row.error}`} (${row.ms}ms, $${row.costUsd.toFixed(5)})`,
      traceId: t.traceId, spanId, runId: t.runId, workspaceId: t.workspaceId, durationMs: row.ms,
      fields: { model: row.model, purpose: row.purpose, tokensIn: row.tokensIn, tokensOut: row.tokensOut, costUsd: row.costUsd, fallbackUsed: row.fallback, schemaRetry: row.schemaRetry, attempt: row.attempt, ok: row.ok },
    });
  };
}

export function deliveryTelemetry(t: TraceCtx, d: Delivery): void {
  for (const [i, a] of d.attempts.entries()) {
    const spanId = newSpanId();
    t.rep.span({ traceId: t.traceId, spanId, parentId: t.parentId, name: `delivery.${d.channel}`, start: a.at, durationMs: a.ms, status: a.ok ? 'ok' : 'error', attrs: { channel: d.channel, destination: d.destination, attempt: i + 1, receipt: a.ok ? d.receipt : null } });
    const event = a.ok ? 'delivery.sent' : i < d.attempts.length - 1 ? 'delivery.retry' : 'delivery.failed';
    t.rep.log({
      level: a.ok ? 'info' : 'warn', component: 'delivery', event, message: `${d.channel} → ${d.destination}: ${a.note}`, traceId: t.traceId, spanId, runId: t.runId, workspaceId: t.workspaceId,
      durationMs: a.ms, fields: { channel: d.channel, destination: d.destination, receipt: d.receipt, attempt: i + 1, insightId: d.insightId, deliveryId: d.id },
    });
  }
}

/** Pipeline hooks → `step.started` / `step.finished` logs and one span per step. */
export function pipelineTelemetry(t: TraceCtx): PipelineTelemetry & { stepSpan(key: StepKey): string } {
  // Step spans hang off the run's root span. The executors repoint t.parentId at the current step
  // so AI calls and deliveries nest under it; read the root once, here, before that happens.
  const root = t.parentId;
  const spans = new Map<StepKey, string>();
  const stepSpan = (key: StepKey) => {
    let s = spans.get(key);
    if (!s) {
      s = newSpanId();
      spans.set(key, s);
    }
    return s;
  };
  return {
    stepSpan,
    stepStarted(key, at) {
      t.rep.log({ level: 'info', component: 'workflow', event: 'step.started', message: `step ${key} started`, traceId: t.traceId, spanId: stepSpan(key), runId: t.runId, workspaceId: t.workspaceId, durationMs: null, fields: { step: key }, at });
    },
    stepFinished(row: RunStep) {
      const spanId = stepSpan(row.key);
      t.rep.span({
        traceId: t.traceId, spanId, parentId: root, name: `step.${row.key}`, start: row.startedAt ?? new Date().toISOString(), durationMs: row.durationMs ?? 0,
        status: row.status === 'failed' ? 'error' : 'ok', attrs: { status: row.status, model: row.model, tokensIn: row.tokensIn, tokensOut: row.tokensOut, costUsd: row.costUsd },
      });
      t.rep.log({
        level: row.status === 'failed' ? 'error' : row.status === 'warned' ? 'warn' : 'info', component: 'workflow', event: 'step.finished', message: `step ${row.key} ${row.status}: ${row.summary ?? ''}`,
        traceId: t.traceId, spanId, runId: t.runId, workspaceId: t.workspaceId, durationMs: row.durationMs, fields: { step: row.key, status: row.status, model: row.model, costUsd: row.costUsd },
      });
      // Feeds Agent Ops' grounding SLO: quotes checked against the transcript, per run.
      if (row.key === 'ground' && row.status !== 'failed') {
        const d = (row.detail ?? {}) as { quotes?: number; grounded?: number; droppedInsights?: number };
        const total = Number(d.quotes ?? 0);
        const passed = Number(d.grounded ?? 0);
        const dropped = Number(d.droppedInsights ?? 0);
        t.rep.log({
          level: total > passed ? 'warn' : 'info', component: 'workflow', event: 'grounding.checked',
          message: `${passed} of ${total} quotes grounded${dropped ? `; ${dropped} insight${dropped === 1 ? '' : 's'} dropped` : ''}`,
          traceId: t.traceId, spanId, runId: t.runId, workspaceId: t.workspaceId, durationMs: row.durationMs, fields: { passed, total, dropped },
        });
      }
    },
    delivery(d) {
      deliveryTelemetry(t, d);
    },
  };
}
