/**
 * The Agent Ops SDK: the only way an agent reports into the platform. Signal Loop calls
 * these from its API, Workflow and AI layer. Writes are buffered per request and flushed
 * with ctx.waitUntil so telemetry never slows the user path.
 *
 * Owned by the platform builder; the signatures below are the stable contract.
 */
import type { IngestBatch, LogEntry, Span, UsageEvent, WorkUnit } from '../../shared/platform-contracts';
import type { Env } from '../env';
import { ingest } from './ingest';

export type Reporter = {
  log(entry: Omit<LogEntry, 'id' | 'agentId' | 'source' | 'at'> & { at?: string }): void;
  span(span: Omit<Span, 'agentId'>): void;
  track(event: Omit<UsageEvent, 'id' | 'agentId' | 'source' | 'at'> & { at?: string }): void;
  work(unit: Omit<WorkUnit, 'id' | 'agentId' | 'source' | 'at'> & { at?: string }): void;
  /** Flush buffered telemetry (call via ctx.waitUntil(reporter.flush())). */
  flush(): Promise<void>;
};

export function reporter(env: Env, agentId: string): Reporter {
  const batch: IngestBatch = { agentId, events: [], logs: [], spans: [], work: [] };
  const now = () => new Date().toISOString();
  // Workers freeze the clock during synchronous work, so several logs can share a millisecond.
  // Nudge ties forward by 1ms so log order is stable and matches emit order.
  let lastLogMs = 0;
  const logAt = (at: string | undefined) => {
    const ms = Math.max(at ? Date.parse(at) : Date.now(), lastLogMs + 1);
    lastLogMs = ms;
    return new Date(ms).toISOString();
  };
  const id = () => crypto.randomUUID();
  return {
    log(e) {
      const row: LogEntry = { id: id(), agentId, source: 'live', ...e, at: logAt(e.at) } as LogEntry;
      console.log(JSON.stringify({ level: row.level, event: row.event, msg: row.message, trace: row.traceId, run: row.runId, ms: row.durationMs, ...row.fields }));
      batch.logs.push(row);
    },
    span(s) {
      batch.spans.push({ agentId, ...s });
    },
    track(e) {
      batch.events.push({ id: id(), agentId, source: 'live', at: e.at ?? now(), ...e } as UsageEvent);
    },
    work(u) {
      batch.work.push({ id: id(), agentId, source: 'live', at: u.at ?? now(), ...u } as WorkUnit);
    },
    async flush() {
      if (!batch.events.length && !batch.logs.length && !batch.spans.length && !batch.work.length) return;
      const out = { ...batch, events: batch.events.splice(0), logs: batch.logs.splice(0), spans: batch.spans.splice(0), work: batch.work.splice(0) };
      try {
        await ingest(env, out);
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', event: 'platform.ingest_failed', msg: String(err) }));
      }
    },
  };
}
