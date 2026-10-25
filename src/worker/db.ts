/**
 * D1 access: row mappers, workspace scoping (seed ∪ own) and copy-on-write overlays.
 */
import type { Account, Delivery, Insight, LibraryFile, Notification, Person, Redaction, ReviewRecord, RoutingRule, Run, RunStep, ScreenOutput, StepKey, Turn } from '../shared/contracts.ts';
import { STEP_KEYS } from '../shared/contracts.ts';
import type { StoredStep } from '../pipeline/replay.ts';

export const SEED = 'seed';

type Row = Record<string, unknown>;

export function j<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string' || !v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const bool = (v: unknown): boolean | null => (v === null || v === undefined ? null : Number(v) === 1 || v === true);

export function nowIso(): string {
  return new Date().toISOString();
}

// ------------------------------------------------------------------ runs

export type RunRow = Run & { replayOf: string | null; workflowId: string | null; error: string | null; format: string | null; screen: ScreenOutput | null; keyScope: string };

export function rowToRun(r: Row): RunRow {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    fileId: str(r.file_id),
    filename: String(r.filename),
    accountId: str(r.account_id),
    callId: str(r.call_id),
    status: String(r.status) as Run['status'],
    mode: String(r.mode) as Run['mode'],
    modeReason: str(r.mode_reason),
    sha256: String(r.sha256),
    createdAt: String(r.created_at),
    finishedAt: str(r.finished_at),
    durationMs: num(r.duration_ms),
    costUsd: Number(r.cost_usd ?? 0),
    promptVersion: String(r.prompt_version),
    insightCount: Number(r.insight_count ?? 0),
    droppedCount: Number(r.dropped_count ?? 0),
    reviewCount: Number(r.review_count ?? 0),
    injectionFlagged: Number(r.injection_flagged ?? 0) === 1,
    actionable: bool(r.actionable),
    replayOf: str(r.replay_of),
    workflowId: str(r.workflow_id),
    error: str(r.error),
    format: str(r.format),
    screen: j<ScreenOutput | null>(r.screen, null),
    keyScope: String(r.key_scope ?? 'runtime'),
  };
}

export function publicRun(r: RunRow): Run {
  const { replayOf: _a, workflowId: _b, error: _c, format: _d, screen: _e, keyScope: _f, ...run } = r;
  return run;
}

export async function insertRun(db: D1Database, r: RunRow): Promise<void> {
  await insertRunStatement(db, r).run();
}

export function insertRunStatement(db: D1Database, r: RunRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO runs (id, workspace_id, file_id, filename, account_id, call_id, status, mode, mode_reason, sha256, created_at, finished_at, duration_ms, cost_usd, prompt_version,
        insight_count, dropped_count, review_count, injection_flagged, actionable, error, workflow_id, replay_of, format, screen, key_scope)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      r.id, r.workspaceId, r.fileId, r.filename, r.accountId, r.callId, r.status, r.mode, r.modeReason, r.sha256, r.createdAt, r.finishedAt, r.durationMs, r.costUsd, r.promptVersion,
      r.insightCount, r.droppedCount, r.reviewCount, r.injectionFlagged ? 1 : 0, r.actionable === null ? null : r.actionable ? 1 : 0, r.error, r.workflowId, r.replayOf, r.format,
      r.screen ? JSON.stringify(r.screen) : null, r.keyScope,
    );
}

const RUN_COLUMNS: Record<string, string> = {
  status: 'status', mode: 'mode', modeReason: 'mode_reason', sha256: 'sha256', finishedAt: 'finished_at', durationMs: 'duration_ms', costUsd: 'cost_usd', insightCount: 'insight_count',
  droppedCount: 'dropped_count', reviewCount: 'review_count', injectionFlagged: 'injection_flagged', actionable: 'actionable', error: 'error', workflowId: 'workflow_id', format: 'format',
  screen: 'screen', createdAt: 'created_at', replayOf: 'replay_of', promptVersion: 'prompt_version',
};

/** The UPDATE for a run-row patch (null when the patch names no known column). */
export function updateRunStatement(db: D1Database, runId: string, patch: Record<string, unknown>, opts: { onlyIfLive?: boolean } = {}): D1PreparedStatement | null {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = RUN_COLUMNS[k];
    if (!col) continue;
    sets.push(`${col} = ?`);
    vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : v !== null && typeof v === 'object' ? JSON.stringify(v) : v ?? null);
  }
  if (!sets.length) return null;
  return db.prepare(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?${opts.onlyIfLive ? " AND mode = 'live'" : ''}`).bind(...vals, runId);
}

export async function updateRunRow(db: D1Database, runId: string, patch: Record<string, unknown>, opts: { onlyIfLive?: boolean } = {}): Promise<number> {
  const stmt = updateRunStatement(db, runId, patch, opts);
  if (!stmt) return 0;
  const res = await stmt.run();
  return res.meta.changes ?? 0;
}

export async function getRunRow(db: D1Database, runId: string): Promise<RunRow | null> {
  const r = await db.prepare('SELECT * FROM runs WHERE id = ?').bind(runId).first<Row>();
  return r ? rowToRun(r) : null;
}

// ------------------------------------------------------------------ steps

export function rowToStep(r: Row): StoredStep {
  return {
    runId: String(r.run_id),
    key: String(r.key) as StepKey,
    status: String(r.status) as RunStep['status'],
    startedAt: str(r.started_at),
    finishedAt: str(r.finished_at),
    durationMs: num(r.duration_ms),
    model: str(r.model),
    tokensIn: num(r.tokens_in),
    tokensOut: num(r.tokens_out),
    costUsd: num(r.cost_usd),
    summary: str(r.summary),
    detail: j<Record<string, unknown> | null>(r.detail, null),
    offsetMs: num(r.offset_ms),
  };
}

export function stepStatement(db: D1Database, s: RunStep & { offsetMs?: number | null }): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO run_steps (run_id, key, idx, status, started_at, finished_at, duration_ms, model, tokens_in, tokens_out, cost_usd, summary, detail, offset_ms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(run_id, key) DO UPDATE SET status=excluded.status, started_at=excluded.started_at, finished_at=excluded.finished_at, duration_ms=excluded.duration_ms,
         model=excluded.model, tokens_in=excluded.tokens_in, tokens_out=excluded.tokens_out, cost_usd=excluded.cost_usd, summary=excluded.summary, detail=excluded.detail, offset_ms=excluded.offset_ms`,
    )
    .bind(s.runId, s.key, STEP_KEYS.indexOf(s.key), s.status, s.startedAt, s.finishedAt, s.durationMs, s.model, s.tokensIn, s.tokensOut, s.costUsd, s.summary, s.detail ? JSON.stringify(s.detail) : null, s.offsetMs ?? null);
}

export async function getSteps(db: D1Database, runId: string): Promise<StoredStep[]> {
  const { results } = await db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx').bind(runId).all<Row>();
  return results.map(rowToStep);
}

// ------------------------------------------------------------------ transcripts

export async function getTranscript(db: D1Database, runId: string): Promise<{ turns: Turn[]; redactions: Redaction[]; format: string } | null> {
  const r = await db.prepare('SELECT format, turns, redactions FROM transcripts WHERE run_id = ?').bind(runId).first<Row>();
  if (!r) return null;
  return { format: String(r.format), turns: j<Turn[]>(r.turns, []), redactions: j<Redaction[]>(r.redactions, []) };
}

// ------------------------------------------------------------------ overlays

export async function loadOverlays<T>(db: D1Database, ws: string, entity: 'insight' | 'delivery'): Promise<Map<string, T>> {
  if (ws === SEED) return new Map();
  const { results } = await db.prepare('SELECT entity_id, data FROM overlays WHERE workspace_id = ? AND entity = ?').bind(ws, entity).all<Row>();
  return new Map(results.map((r) => [String(r.entity_id), j<T>(r.data, {} as T)]));
}

export function overlayStatement(db: D1Database, ws: string, entity: 'insight' | 'delivery', id: string, data: unknown): D1PreparedStatement {
  return db
    .prepare('INSERT INTO overlays (workspace_id, entity, entity_id, data, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id, entity, entity_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
    .bind(ws, entity, id, JSON.stringify(data), nowIso());
}

// ------------------------------------------------------------------ insights

export function insightStatement(db: D1Database, i: Insight): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO insights (id, workspace_id, run_id, account_id, type, product_area, status, theme_id, created_at, data) VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET type=excluded.type, product_area=excluded.product_area, status=excluded.status, theme_id=excluded.theme_id, data=excluded.data`,
    )
    .bind(i.id, i.workspaceId, i.runId, i.accountId, i.type, i.productArea, i.status, i.themeId, i.createdAt, JSON.stringify(i));
}

/** Insights visible to `ws` (seed ∪ own) matching an SQL filter, with own overlays applied. */
export async function queryInsights(db: D1Database, ws: string, where = '1=1', binds: unknown[] = [], limit = 2000): Promise<Insight[]> {
  const overlays = await loadOverlays<Insight>(db, ws, 'insight');
  const { results } = await db
    .prepare(`SELECT data FROM insights WHERE workspace_id IN (?, ?) AND (${where}) ORDER BY created_at DESC LIMIT ?`)
    .bind(SEED, ws, ...binds, limit)
    .all<Row>();
  const rows = results.map((r) => j<Insight>(r.data, null as unknown as Insight));
  // Overlays can change status/theme, so overlaid rows outside the filter are fetched too
  // (callers re-filter on the overlaid values).
  const seen = new Set(rows.map((r) => r.id));
  const missing = [...overlays.keys()].filter((id) => !seen.has(id));
  for (let k = 0; k < missing.length; k += 80) {
    const chunk = missing.slice(k, k + 80);
    const more = await db.prepare(`SELECT data FROM insights WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<Row>();
    for (const r of more.results) rows.push(j<Insight>(r.data, null as unknown as Insight));
  }
  return rows.map((i) => overlays.get(i.id) ?? i);
}

export async function getInsight(db: D1Database, ws: string, id: string): Promise<Insight | null> {
  const r = await db.prepare('SELECT data FROM insights WHERE id = ? AND workspace_id IN (?, ?)').bind(id, SEED, ws).first<Row>();
  if (!r) return null;
  const overlays = await loadOverlays<Insight>(db, ws, 'insight');
  const i = j<Insight>(r.data, null as unknown as Insight);
  return overlays.get(id) ?? i;
}

/** Write an insight change: own rows in place, seed rows as an overlay. */
export function writeInsight(db: D1Database, ws: string, i: Insight): D1PreparedStatement {
  return i.workspaceId === ws ? insightStatement(db, i) : overlayStatement(db, ws, 'insight', i.id, i);
}

// ------------------------------------------------------------------ deliveries / notifications

export function deliveryStatement(db: D1Database, d: Delivery): D1PreparedStatement {
  return db
    .prepare('INSERT INTO deliveries (id, workspace_id, insight_id, channel, ticket_state, created_at, data) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ticket_state=excluded.ticket_state, data=excluded.data')
    .bind(d.id, d.workspaceId, d.insightId, d.channel, d.ticketState, d.createdAt, JSON.stringify(d));
}

export async function queryDeliveries(db: D1Database, ws: string, where = '1=1', binds: unknown[] = [], limit = 2000): Promise<Delivery[]> {
  const overlays = await loadOverlays<Delivery>(db, ws, 'delivery');
  const { results } = await db
    .prepare(`SELECT data FROM deliveries WHERE workspace_id IN (?, ?) AND (${where}) ORDER BY created_at DESC LIMIT ?`)
    .bind(SEED, ws, ...binds, limit)
    .all<Row>();
  return results.map((r) => {
    const d = j<Delivery>(r.data, null as unknown as Delivery);
    return overlays.get(d.id) ?? d;
  });
}

export function writeDelivery(db: D1Database, ws: string, d: Delivery): D1PreparedStatement {
  return d.workspaceId === ws ? deliveryStatement(db, d) : overlayStatement(db, ws, 'delivery', d.id, d);
}

export function notificationStatement(db: D1Database, n: Notification): D1PreparedStatement {
  return db
    .prepare('INSERT INTO notifications (id, workspace_id, csm_id, created_at, data) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
    .bind(n.id, n.workspaceId, n.csmId, n.createdAt, JSON.stringify(n));
}

export async function queryNotifications(db: D1Database, ws: string, csmId: string | null, limit = 200): Promise<Notification[]> {
  const { results } = await db
    .prepare(`SELECT data FROM notifications WHERE workspace_id IN (?, ?)${csmId ? ' AND csm_id = ?' : ''} ORDER BY created_at DESC LIMIT ?`)
    .bind(SEED, ws, ...(csmId ? [csmId] : []), limit)
    .all<Row>();
  return results.map((r) => j<Notification>(r.data, null as unknown as Notification));
}

export async function queryReviews(db: D1Database, ws: string, insightId: string): Promise<ReviewRecord[]> {
  const { results } = await db.prepare('SELECT data FROM reviews WHERE insight_id = ? AND workspace_id IN (?, ?) ORDER BY created_at').bind(insightId, SEED, ws).all<Row>();
  return results.map((r) => j<ReviewRecord>(r.data, null as unknown as ReviewRecord));
}

// ------------------------------------------------------------------ world

export async function getAccounts(db: D1Database): Promise<Account[]> {
  const { results } = await db.prepare('SELECT data FROM accounts ORDER BY id').all<Row>();
  return results.map((r) => j<Account>(r.data, null as unknown as Account));
}

export async function getPeople(db: D1Database): Promise<Person[]> {
  const { results } = await db.prepare('SELECT data FROM people ORDER BY id').all<Row>();
  return results.map((r) => j<Person>(r.data, null as unknown as Person));
}

export async function getLibraryFile(db: D1Database, id: string): Promise<(LibraryFile & { sha256: string }) | null> {
  const r = await db.prepare('SELECT data, sha256 FROM library_files WHERE id = ?').bind(id).first<Row>();
  return r ? { ...j<LibraryFile>(r.data, null as unknown as LibraryFile), sha256: String(r.sha256) } : null;
}

export async function getRawContent(db: D1Database, sha256: string): Promise<string | null> {
  const r = await db.prepare('SELECT content FROM raw_files WHERE sha256 = ?').bind(sha256).first<Row>();
  return r ? String(r.content) : null;
}

export async function getRules(db: D1Database, ws: string): Promise<{ seed: RoutingRule[]; own: RoutingRule[] }> {
  const { results } = await db.prepare('SELECT workspace_id, data FROM routing_rules WHERE workspace_id IN (?, ?) ORDER BY priority, id').bind(SEED, ws).all<Row>();
  const seed: RoutingRule[] = [];
  const own: RoutingRule[] = [];
  for (const r of results) (String(r.workspace_id) === SEED ? seed : own).push(j<RoutingRule>(r.data, null as unknown as RoutingRule));
  return { seed, own: ws === SEED ? [] : own };
}

// ------------------------------------------------------------------ settings

export async function getSetting<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const r = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<Row>();
  return r ? j<T>(r.value, fallback) : fallback;
}

export async function putSetting(db: D1Database, key: string, value: unknown): Promise<void> {
  await db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').bind(key, JSON.stringify(value), nowIso()).run();
}

export async function audit(db: D1Database, row: { workspaceId: string | null; actor: string; action: string; target: string | null; before?: unknown; after?: unknown }): Promise<void> {
  await db
    .prepare('INSERT INTO audit_log (id, workspace_id, actor, action, target, before, after, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(`aud_${crypto.randomUUID().slice(0, 18)}`, row.workspaceId, row.actor, row.action, row.target, row.before === undefined ? null : JSON.stringify(row.before), row.after === undefined ? null : JSON.stringify(row.after), nowIso())
    .run();
}

/** D1 batch in chunks (keeps each batch well under statement limits). */
export async function batch(db: D1Database, stmts: D1PreparedStatement[], size = 50): Promise<void> {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}
