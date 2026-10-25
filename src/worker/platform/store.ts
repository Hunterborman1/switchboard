/**
 * Agent Ops reads: small SQL helpers over PLATFORM_DB plus the registry loader and the
 * calendar the reports share. Aggregation SQL returns compact grouped rows; the finishing
 * arithmetic lives in math.ts so it is unit-tested once.
 */
import type { AgentRecord } from '../../shared/platform-contracts';
import { addDays, isoDay, reviewStatus } from './math';
import type { AgentProfile, ReviewStatus } from './types';

export type Db = D1Database;

export async function all<T>(db: Db, sql: string, ...binds: unknown[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...binds).all<T>();
  return r.results ?? [];
}
export async function first<T>(db: Db, sql: string, ...binds: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...binds).first<T>()) ?? null;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- calendar

export type Meta = { simFrom: string; simTo: string; seededAt: string | null; rolledDays: number };

export async function loadMeta(db: Db): Promise<Meta> {
  const rows = await all<{ key: string; value: string }>(db, 'SELECT key, value FROM meta');
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const today = isoDay(Date.now());
  return {
    simFrom: m.get('sim_from') ?? isoDay(addDays(today, -40)),
    simTo: m.get('sim_to') ?? today,
    seededAt: m.get('seeded_at') ?? null,
    rolledDays: Number(m.get('rolled_days') ?? 0),
  };
}

/**
 * The reporting calendar. `period` runs from the first simulated day to now. `ref` anchors
 * the "latest week" comparisons: now, or the last simulated day if now is past it (the
 * simulated history rolls forward a week at a time, so the gap is at most six days).
 */
export type Calendar = { from: string; to: string; ref: string; simTo: string; simToEnd: string; now: string };
export function calendar(meta: Meta, now: Date): Calendar {
  const nowIso = now.toISOString();
  const simToEnd = `${meta.simTo}T23:59:59.999Z`;
  return { from: `${meta.simFrom}T00:00:00.000Z`, to: nowIso, ref: nowIso > simToEnd ? simToEnd : nowIso, simTo: meta.simTo, simToEnd, now: nowIso };
}

// ---------------------------------------------------------------- registry

export type AgentRow = { record: AgentRecord; profile: AgentProfile; reviewStatus: ReviewStatus };

export async function loadAgents(db: Db, now: Date): Promise<AgentRow[]> {
  const rows = await all<{ id: string; record: string; profile: string; last_review: string; next_review: string; launched_at: string }>(
    db,
    'SELECT id, record, profile, last_review, next_review, launched_at FROM agents ORDER BY sort, id',
  );
  return rows.map((r) => {
    const base = parseJson<Omit<AgentRecord, 'lastReview' | 'nextReview' | 'launchedAt'>>(r.record, {} as never);
    const record: AgentRecord = { ...base, lastReview: r.last_review, nextReview: r.next_review, launchedAt: r.launched_at };
    const profile = parseJson<AgentProfile>(r.profile, {} as never);
    return { record, profile, reviewStatus: reviewStatus(record.nextReview, now) };
  });
}

/** Standard checks with the two that are evaluated live: review cadence and live logging. */
export function effectiveStandard(a: AgentRow, liveLogAt: string | null, now: Date): AgentRecord['standard'] {
  return a.record.standard.map((c) => {
    if (c.key === 'review_cadence') {
      const passed = a.reviewStatus !== 'overdue';
      const when = a.record.nextReview;
      const label = a.reviewStatus === 'overdue' ? 'overdue since' : a.reviewStatus === 'due_soon' ? 'due soon:' : 'next review';
      return { ...c, passed, evidence: `${c.evidence} Last review ${a.record.lastReview}; ${label} ${when}.` };
    }
    if (c.key === 'logging' && a.record.source === 'live') {
      const fresh = liveLogAt != null && Date.parse(liveLogAt) > now.getTime() - 7 * 86_400_000;
      return {
        ...c,
        passed: fresh,
        evidence: fresh ? `${c.evidence} Last live log ${liveLogAt}.` : `No live telemetry received in the last 7 days. ${c.evidence}`,
      };
    }
    return c;
  });
}

export async function lastLiveLogAt(db: Db, agentId: string): Promise<string | null> {
  const r = await first<{ at: string | null }>(db, "SELECT max(at) AS at FROM logs WHERE agent_id = ? AND source = 'live'", agentId);
  return r?.at ?? null;
}

export async function peopleMap(db: Db): Promise<Map<string, { name: string; role: string; department: string; title: string }>> {
  const rows = await all<{ id: string; name: string; role: string; department: string; title: string }>(db, 'SELECT id, name, role, department, title FROM people');
  return new Map(rows.map((r) => [r.id, r]));
}

export function displayName(actorId: string, people: Map<string, { name: string }>): string {
  const p = people.get(actorId);
  if (p) return p.name;
  if (actorId.startsWith('viewer:')) return `Demo viewer ${actorId.slice(7, 13)}`;
  return actorId;
}

// ---------------------------------------------------------------- roll-forward

/**
 * Keep the simulated six weeks aligned with the calendar. Once today is a full week past the
 * last simulated day, every simulated timestamp (and the registry's review dates) moves
 * forward by whole weeks, so weekday patterns stay intact. Live rows never move. The meta
 * update is conditional and the batch is one transaction, so concurrent requests cannot
 * shift twice.
 */
let lastRollCheck = 0;
export async function rollForward(db: Db, now: Date, force = false): Promise<number> {
  if (!force && now.getTime() - lastRollCheck < 10 * 60_000) return 0;
  lastRollCheck = now.getTime();
  const meta = await loadMeta(db);
  if (!meta.seededAt) return 0;
  const gap = Math.floor((Date.parse(isoDay(now)) - Date.parse(meta.simTo)) / 86_400_000);
  if (gap < 7) return 0;
  const days = 7 * Math.floor(gap / 7);
  const mod = `+${days} days`;
  const guard = "(SELECT value FROM meta WHERE key = 'sim_to') = ?";
  const ts = (col: string) => `${col} = strftime('%Y-%m-%dT%H:%M:%fZ', ${col}, '${mod}')`;
  const d = (col: string) => `${col} = date(${col}, '${mod}')`;
  const old = meta.simTo;
  await db.batch([
    db.prepare(`UPDATE usage_events SET ${ts('at')} WHERE source = 'simulated' AND ${guard}`).bind(old),
    db.prepare(`UPDATE logs SET ${ts('at')} WHERE source = 'simulated' AND ${guard}`).bind(old),
    db.prepare(`UPDATE spans SET ${ts('start')} WHERE source = 'simulated' AND ${guard}`).bind(old),
    db.prepare(`UPDATE work_units SET ${ts('at')} WHERE source = 'simulated' AND ${guard}`).bind(old),
    db.prepare(`UPDATE changelog SET ${ts('at')} WHERE source = 'simulated' AND ${guard}`).bind(old),
    db.prepare(`UPDATE alerts SET ${ts('at')}, resolved_at = CASE WHEN resolved_at IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', resolved_at, '${mod}') END WHERE ${guard}`).bind(old),
    db.prepare(
      `UPDATE agents SET ${d('last_review')}, ${d('next_review')}, ${d('launched_at')}, profile = json_set(profile, '$.securityReview.date', date(json_extract(profile, '$.securityReview.date'), '${mod}'), '$.promotedAt', date(json_extract(profile, '$.promotedAt'), '${mod}'), '$.retiredAt', date(json_extract(profile, '$.retiredAt'), '${mod}')) WHERE ${guard}`,
    ).bind(old),
    db.prepare(`UPDATE meta SET value = date(value, '${mod}') WHERE key = 'sim_from' AND ${guard}`).bind(old),
    db.prepare(`UPDATE meta SET value = date(value, '${mod}') WHERE key = 'sim_to' AND value = ?`).bind(old),
    db.prepare(`UPDATE meta SET value = CAST(CAST(value AS INTEGER) + CAST(? AS INTEGER) AS TEXT) WHERE key = 'rolled_days' AND (SELECT value FROM meta WHERE key = 'sim_to') = date(?, '${mod}')`).bind(days, old),
  ]);
  return days;
}
