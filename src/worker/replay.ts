/**
 * Replay materialization and the read-time view. A replay copies a recorded live run into the
 * viewer's workspace with fresh ids and shifted timestamps; GET /runs/:id then reveals steps,
 * insights, routing and deliveries as the recorded timeline elapses. Future-dated rows are
 * hidden from list endpoints until their moment arrives.
 */
import type { Delivery, Insight, Notification, Run, RunDetail, RunStep } from '../shared/contracts.ts';
import { fastPathTiming, revealSteps, replayTotalMs, stepDone, type ReplayRecording, type StoredStep } from '../pipeline/replay.ts';
import { randomId } from '../pipeline/util.ts';
import { batch, deliveryStatement, getSteps, getTranscript, insightStatement, j, notificationStatement, publicRun, queryDeliveries, queryInsights, SEED, stepStatement, type RunRow } from './db.ts';

export async function getRecording(db: D1Database, fileId: string): Promise<ReplayRecording | null> {
  const { results } = await db.prepare('SELECT data FROM replays WHERE file_id = ? ORDER BY part').bind(fileId).all<{ data: string }>();
  const rec = results.length ? j<ReplayRecording | null>(results.map((r) => r.data).join(''), null) : null;
  // Replays reveal at the live fast path's pace (screen ∥ extract, theme names after the run).
  return rec ? fastPathTiming(rec) : null;
}

export async function hasRecording(db: D1Database, fileId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS x FROM replays WHERE file_id = ?').bind(fileId).first());
}

/** Replace every recorded id with a fresh one, consistently across the whole recording. */
function remapIds(rec: ReplayRecording, runId: string, workspaceId: string, existingThemeIds: Set<string>): ReplayRecording {
  const map = new Map<string, string>();
  for (const i of rec.insights) map.set(i.id, randomId('ins'));
  for (const d of rec.deliveries) map.set(d.id, randomId('dlv'));
  for (const n of rec.notifications) map.set(n.id, randomId('ntf'));
  for (const t of rec.newThemes) map.set(t.id, randomId('thm'));
  let s = JSON.stringify(rec);
  for (const [from, to] of map) s = s.split(from).join(to);
  const out = JSON.parse(s) as ReplayRecording;
  const newThemeIds = new Set(out.newThemes.map((t) => t.id));
  for (const i of out.insights) {
    i.runId = runId;
    i.workspaceId = workspaceId;
    if (i.themeId && !newThemeIds.has(i.themeId) && !existingThemeIds.has(i.themeId)) i.themeId = null;
  }
  for (const d of out.deliveries) d.workspaceId = workspaceId;
  for (const n of out.notifications) n.workspaceId = workspaceId;
  for (const t of out.newThemes) t.workspaceId = workspaceId;
  return out;
}

const shiftIso = (iso: string, delta: number) => new Date(Date.parse(iso) + delta).toISOString();

/**
 * Write a replay of `rec` as run `run` (already inserted or updated by the caller with
 * mode 'replay'). Insights/deliveries are dated at the moment they appear in the timeline.
 */
export async function materializeReplay(db: D1Database, run: RunRow, rec: ReplayRecording, startMs: number): Promise<void> {
  const { results: themeRows } = await db.prepare('SELECT id FROM themes WHERE workspace_id IN (?, ?)').bind(SEED, run.workspaceId).all<{ id: string }>();
  const r = remapIds(rec, run.id, run.workspaceId, new Set(themeRows.map((t) => t.id)));
  const at = (key: string) => {
    const s = r.steps.find((x) => x.key === key);
    return s ? startMs + s.offsetMs + (s.durationMs ?? 0) : startMs;
  };
  const stmts: D1PreparedStatement[] = [];
  for (const s of r.steps) stmts.push(stepStatement(db, { ...s, runId: run.id, startedAt: null, finishedAt: null }));
  stmts.push(
    db.prepare('INSERT INTO transcripts (run_id, format, turns, redactions) VALUES (?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET format=excluded.format, turns=excluded.turns, redactions=excluded.redactions').bind(run.id, r.run.format, JSON.stringify(r.turns), JSON.stringify(r.redactions)),
  );
  for (const t of r.newThemes) {
    stmts.push(
      db.prepare('INSERT OR IGNORE INTO themes (id, workspace_id, name, summary, type, product_area, status, owner_id, created_at, vector) VALUES (?,?,?,?,?,?,?,?,?,NULL)').bind(t.id, run.workspaceId, t.name, t.summary, t.type, t.productArea, t.status, t.ownerId, new Date(at('theme')).toISOString()),
    );
  }
  const insightAt = new Date(at('score')).toISOString();
  for (const i of r.insights) stmts.push(insightStatement(db, { ...i, createdAt: insightAt }));
  const deliverAt = at('deliver');
  for (const d of r.deliveries) {
    const delta = deliverAt - Date.parse(d.createdAt);
    stmts.push(deliveryStatement(db, { ...d, createdAt: new Date(deliverAt).toISOString(), attempts: d.attempts.map((a) => ({ ...a, at: shiftIso(a.at, delta) })) }));
  }
  for (const n of r.notifications) stmts.push(notificationStatement(db, { ...n, createdAt: new Date(deliverAt).toISOString() }));
  await batch(db, stmts);
}

/** Run fields for a new replay run from its recording. */
export function replayRunFields(rec: ReplayRecording, startMs: number): Pick<Run, 'status' | 'finishedAt' | 'durationMs' | 'costUsd' | 'insightCount' | 'droppedCount' | 'reviewCount' | 'injectionFlagged' | 'actionable' | 'sha256' | 'promptVersion'> & { format: string } {
  return {
    status: rec.run.status === 'failed' ? 'failed' : rec.insights.some((i) => i.status === 'pending_review') ? 'awaiting_review' : 'completed',
    finishedAt: new Date(startMs + rec.totalMs).toISOString(),
    durationMs: rec.run.durationMs,
    costUsd: rec.run.costUsd,
    insightCount: rec.insights.filter((i) => i.gate !== 'dropped').length,
    droppedCount: rec.insights.filter((i) => i.gate === 'dropped').length,
    reviewCount: rec.insights.filter((i) => i.status === 'pending_review').length,
    injectionFlagged: rec.run.injectionFlagged,
    actionable: rec.run.actionable,
    sha256: rec.run.sha256,
    promptVersion: rec.promptVersion,
    format: rec.run.format,
  };
}

/** Everything the Run view needs, revealed by elapsed time for replays. */
export async function runDetail(db: D1Database, ws: string, run: RunRow, now = Date.now()): Promise<RunDetail> {
  const stored = await getSteps(db, run.id);
  const transcript = await getTranscript(db, run.id);
  const insightsAll = await queryInsights(db, ws, 'run_id = ?', [run.id]);
  const insights = insightsAll.filter((i) => i.runId === run.id);
  const deliveriesAll = insights.length ? await queryDeliveries(db, ws, `insight_id IN (${insights.map(() => '?').join(',')})`, insights.map((i) => i.id)) : [];
  const order = (a: Insight, b: Insight) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt));
  insights.sort(order);
  if (run.mode !== 'replay') {
    return {
      run: publicRun(run),
      steps: stored.map(({ offsetMs: _o, ...s }) => s),
      turns: transcript?.turns ?? [],
      redactions: transcript?.redactions ?? [],
      insights,
      deliveries: deliveriesAll,
      screen: run.screen,
    };
  }
  const start = Date.parse(run.createdAt);
  const view: RunStep[] = revealSteps(stored as StoredStep[], start, now);
  const done = (k: Parameters<typeof stepDone>[1]) => stepDone(view, k);
  const allDone = now - start >= replayTotalMs(stored as StoredStep[]);
  const visibleInsights: Insight[] = done('score')
    ? insights.map((i) => ({
        ...i,
        themeId: done('theme') ? i.themeId : null,
        ownerId: done('route') ? i.ownerId : null,
        channel: done('route') ? i.channel : null,
        ruleId: done('route') ? i.ruleId : null,
      }))
    : [];
  const deliveries: Delivery[] = done('deliver') ? deliveriesAll : [];
  const r = publicRun(run);
  return {
    run: allDone
      ? r
      : { ...r, status: 'running', finishedAt: null, durationMs: null, insightCount: done('score') ? r.insightCount : 0, droppedCount: done('score') ? r.droppedCount : 0, reviewCount: done('score') ? r.reviewCount : 0, injectionFlagged: done('screen') ? r.injectionFlagged : false, actionable: done('screen') ? r.actionable : null, costUsd: view.reduce((s, x) => s + (x.costUsd ?? 0), 0) },
    steps: view,
    turns: done('redact') ? transcript?.turns ?? [] : [],
    redactions: done('redact') ? transcript?.redactions ?? [] : [],
    insights: visibleInsights,
    deliveries,
    screen: done('screen') ? run.screen : null,
  };
}

export type { Notification };
