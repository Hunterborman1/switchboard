import { IngestBatch } from '../../shared/platform-contracts';
import type { Env } from '../env';

/**
 * The platform's only write path for agent telemetry. Validates an IngestBatch, caps row
 * sizes, and inserts in D1 batches. Idempotent (INSERT OR IGNORE on ids), and it never throws
 * into the caller: telemetry must not break the agent that reports it.
 */

export const INGEST_LIMITS = {
  rowsPerKind: 500,
  statementsPerBatch: 80,
  message: 2_000,
  json: 4_000,
  text: 200,
} as const;

export type IngestResult = { ok: boolean; inserted: { events: number; logs: number; spans: number; work: number }; dropped: number; error: string | null };

function clip(s: string | null | undefined, n: number): string | null {
  if (s == null) return null;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
function json(v: unknown, n: number = INGEST_LIMITS.json): string {
  let s: string;
  try {
    s = JSON.stringify(v ?? {});
  } catch {
    return '{}';
  }
  if (s.length <= n) return s;
  return JSON.stringify({ _truncated: true, size: s.length });
}
function int(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v);
}

export function isPlatformRequest(event: string, pathOrRoute: string): boolean {
  return event === 'http.request' && /(^|\s|\/api)\/platform(\/|\s|$)/.test(pathOrRoute);
}

export async function ingestInto(db: D1Database, raw: unknown): Promise<IngestResult> {
  const result: IngestResult = { ok: false, inserted: { events: 0, logs: 0, spans: 0, work: 0 }, dropped: 0, error: null };
  const parsed = IngestBatch.safeParse(raw);
  if (!parsed.success) {
    result.error = `invalid batch: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`;
    return result;
  }
  const b = parsed.data;
  const T = INGEST_LIMITS;
  const own = <R extends { agentId: string }>(rows: R[]): R[] => {
    const mine = rows.filter((r) => r.agentId === b.agentId);
    result.dropped += rows.length - mine.length;
    if (mine.length > T.rowsPerKind) result.dropped += mine.length - T.rowsPerKind;
    return mine.slice(0, T.rowsPerKind);
  };

  const stmts: D1PreparedStatement[] = [];
  const events = own(b.events);
  // Requests to Agent Ops itself pass through the host agent's API middleware; they are the
  // platform's traffic, not the agent's, so they never count toward the agent's SLOs.
  const logs = own(b.logs).filter((l) => !isPlatformRequest(l.event, String(l.fields.path ?? l.fields.route ?? l.message)));
  const spans = own(b.spans).filter((s) => !/^[A-Z]+ \/platform(\/|$)/.test(s.name));
  const work = own(b.work);

  const ev = db.prepare('INSERT OR IGNORE INTO usage_events (id, agent_id, source, session_id, actor_id, actor_role, kind, path, props, at, duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for (const e of events) {
    stmts.push(ev.bind(clip(e.id, 80), e.agentId, e.source, clip(e.sessionId, 80), clip(e.actorId, 80), clip(e.actorRole, 40), e.kind, clip(e.path, T.text), json(e.props, 2_000), e.at, int(e.durationMs)));
  }
  const lg = db.prepare('INSERT OR IGNORE INTO logs (id, agent_id, source, at, level, component, event, message, trace_id, span_id, run_id, workspace_id, duration_ms, fields) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const l of logs) {
    stmts.push(lg.bind(clip(l.id, 80), l.agentId, l.source, l.at, l.level, clip(l.component, 40), clip(l.event, 80), clip(l.message, T.message), clip(l.traceId, 80), clip(l.spanId, 80), clip(l.runId, 80), clip(l.workspaceId, 80), int(l.durationMs), json(l.fields)));
  }
  const sp = db.prepare('INSERT OR IGNORE INTO spans (trace_id, span_id, parent_id, agent_id, source, name, start, duration_ms, status, attrs) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const s of spans) {
    stmts.push(sp.bind(clip(s.traceId, 80), clip(s.spanId, 80), clip(s.parentId, 80), s.agentId, 'live', clip(s.name, T.text), s.start, int(s.durationMs) ?? 0, s.status, json(s.attrs)));
  }
  const wk = db.prepare('INSERT OR IGNORE INTO work_units (id, agent_id, source, at, kind, actor_id, minutes_saved, human_minutes, ai_cost_usd, outcome) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const w of work) {
    stmts.push(wk.bind(clip(w.id, 80), w.agentId, w.source, w.at, clip(w.kind, 60), clip(w.actorId, 80), w.minutesSavedEstimate, w.humanMinutesSpent, w.aiCostUsd, w.outcome));
  }

  try {
    for (let i = 0; i < stmts.length; i += T.statementsPerBatch) {
      await db.batch(stmts.slice(i, i + T.statementsPerBatch));
    }
    result.inserted = { events: events.length, logs: logs.length, spans: spans.length, work: work.length };
    result.ok = true;
  } catch (err) {
    result.error = String(err);
  }
  return result;
}

/** Validate and store an agent's telemetry in the platform DB. Never throws. */
export async function ingest(env: Env, batch: unknown): Promise<void> {
  try {
    if (!env.PLATFORM_DB) return;
    const r = await ingestInto(env.PLATFORM_DB, batch);
    if (!r.ok || r.dropped) console.warn(JSON.stringify({ level: r.ok ? 'warn' : 'error', event: 'platform.ingest', ok: r.ok, dropped: r.dropped, error: r.error }));
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'platform.ingest_failed', msg: String(err) }));
  }
}
