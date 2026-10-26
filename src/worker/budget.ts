/**
 * The $15 viewer budget. Spend comes from the ai_calls ledger (key_scope 'runtime'); a run
 * reserves its worst-case estimate (sized from its input: estimateRunCostUsd) with one
 * conditional INSERT (atomic in D1), so concurrent runs cannot overshoot, and at most
 * MAX_UNSETTLED_RESERVATIONS runs hold a reservation at once. When what remains cannot cover
 * another run, live AI flips off in D1 settings and in KV (fast path), and runs fall back to
 * replay. A provider 402 (key out of credit) flips it off too. Owner runs count as well.
 */
import type { Budget } from '../shared/contracts.ts';
import { estimateRunCostUsd, MAX_UNSETTLED_RESERVATIONS, RESERVATION_TTL_MS, RUN_COST_ESTIMATE_USD } from '../shared/scoring.ts';
import { shouldFlipOff } from '../pipeline/budget.ts';
import type { LlmCallRow } from '../pipeline/types.ts';
import type { Env } from './env.ts';
import { getSetting, nowIso, putSetting } from './db.ts';

export const KV_LIVE_FLAG = 'live_enabled';

export function limitUsd(env: Env): number {
  const n = Number(env.BUDGET_LIMIT_USD);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

/** The reservation for a live run over `contentChars` characters of input. */
export function runEstimate(env: Env, contentChars: number): number {
  return estimateRunCostUsd(contentChars, [env.MODEL_PRIMARY, env.MODEL_SECONDARY, env.MODEL_DECISION ?? '']);
}

export async function spentUsd(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS s FROM ai_calls WHERE key_scope = 'runtime'").first<{ s: number }>();
  return Number(r?.s ?? 0);
}

export async function liveFlag(env: Env): Promise<{ enabled: boolean; reason: string | null }> {
  try {
    const kv = await env.KV.get(KV_LIVE_FLAG);
    // KV mirrors the D1 switch on every change; 'true' skips a D1 read on the run-creation path.
    // (The reservation INSERT stays the atomic budget guard either way.)
    if (kv === 'true') return { enabled: true, reason: null };
    if (kv === 'false') {
      const reason = await getSetting<string | null>(env.DB, 'live_disabled_reason', 'budget_reached');
      return { enabled: false, reason };
    }
  } catch {
    /* KV unavailable: D1 is authoritative */
  }
  const enabled = await getSetting<boolean>(env.DB, 'live_enabled', true);
  return { enabled, reason: enabled ? null : await getSetting<string | null>(env.DB, 'live_disabled_reason', 'budget_reached') };
}

export async function setLive(env: Env, enabled: boolean, reason: string | null): Promise<void> {
  await putSetting(env.DB, 'live_enabled', enabled);
  await putSetting(env.DB, 'live_disabled_reason', enabled ? null : reason);
  try {
    await env.KV.put(KV_LIVE_FLAG, enabled ? 'true' : 'false');
  } catch {
    /* D1 remains authoritative */
  }
}

export async function getBudget(env: Env): Promise<Budget> {
  const [spent, flag, runs] = await Promise.all([
    spentUsd(env.DB),
    liveFlag(env),
    env.DB.prepare("SELECT SUM(CASE WHEN mode = 'live' THEN 1 ELSE 0 END) AS live, SUM(CASE WHEN mode = 'replay' THEN 1 ELSE 0 END) AS replay FROM runs WHERE key_scope = 'runtime'").first<{ live: number | null; replay: number | null }>(),
  ]);
  return { limitUsd: limitUsd(env), spentUsd: Math.round(spent * 1e6) / 1e6, liveRuns: Number(runs?.live ?? 0), replayRuns: Number(runs?.replay ?? 0), liveEnabled: flag.enabled, reason: flag.enabled ? null : flag.reason };
}

export type Reservation = { ok: true; estimateUsd: number } | { ok: false; reason: 'budget_reached' | 'disabled_by_owner' | 'busy' };

/** Atomically reserve one run's worst-case cost, within the global cap on unsettled reservations. */
export async function reserve(env: Env, runId: string, estimate = RUN_COST_ESTIMATE_USD, now = Date.now()): Promise<Reservation> {
  const flag = await liveFlag(env);
  if (!flag.enabled) return { ok: false, reason: flag.reason === 'disabled_by_owner' ? 'disabled_by_owner' : 'budget_reached' };
  const limit = limitUsd(env);
  const res = await env.DB.prepare(
    `INSERT INTO budget_reservations (run_id, est_usd, created_ms, settled)
     SELECT ?1, ?2, ?3, 0
     WHERE (SELECT COALESCE(SUM(cost_usd), 0) FROM ai_calls WHERE key_scope = 'runtime')
         + (SELECT COALESCE(SUM(est_usd), 0) FROM budget_reservations WHERE settled = 0 AND created_ms > ?4)
         + ?2 <= ?5
       AND (SELECT COUNT(*) FROM budget_reservations WHERE settled = 0 AND created_ms > ?4) < ?6`,
  )
    .bind(runId, estimate, now, now - RESERVATION_TTL_MS, limit, MAX_UNSETTLED_RESERVATIONS)
    .run();
  if ((res.meta.changes ?? 0) === 1) return { ok: true, estimateUsd: estimate };
  const spent = await spentUsd(env.DB);
  if (shouldFlipOff(spent, limit, RUN_COST_ESTIMATE_USD)) {
    await setLive(env, false, 'budget_reached');
    return { ok: false, reason: 'budget_reached' };
  }
  // This run would not fit even alone; otherwise it fits once open reservations settle.
  if (spent + estimate > limit) return { ok: false, reason: 'budget_reached' };
  return { ok: false, reason: 'busy' };
}

/** Release a reservation; flip live off when the remaining budget cannot cover another run. */
export async function settle(env: Env, runId: string): Promise<void> {
  await env.DB.prepare('UPDATE budget_reservations SET settled = 1 WHERE run_id = ?').bind(runId).run();
  const spent = await spentUsd(env.DB);
  if (shouldFlipOff(spent, limitUsd(env), RUN_COST_ESTIMATE_USD)) await setLive(env, false, 'budget_reached');
}

/** OpenRouter answers 402 when the runtime key is out of credit: stop live AI right away. */
export function isOutOfCredit(row: Pick<LlmCallRow, 'error'>): boolean {
  return !!row.error && /^HTTP 402\b/.test(row.error);
}

export function aiCallStatement(db: D1Database, row: LlmCallRow, workspaceId: string | null, keyScope: 'runtime' | 'build'): D1PreparedStatement {
  return db
    .prepare('INSERT OR IGNORE INTO ai_calls (id, run_id, workspace_id, purpose, model, tokens_in, tokens_out, cost_usd, ms, ok, error, attempt, fallback, schema_retry, key_scope, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(row.id, row.runId, workspaceId, row.purpose, row.model, row.tokensIn, row.tokensOut, row.costUsd, row.ms, row.ok ? 1 : 0, row.error, row.attempt, row.fallback ? 1 : 0, row.schemaRetry ? 1 : 0, keyScope, row.createdAt || nowIso());
}
