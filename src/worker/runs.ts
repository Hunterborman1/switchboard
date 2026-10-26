/**
 * Run lifecycle: create (idempotent by sha256, budget-gated, live or replay), the live → replay
 * fallback, and the context a pipeline run needs (account, people, effective rules, taxonomy).
 */
import { THRESHOLDS, type Account, type FileFormat, type LibraryFile, type Person, type RoutingRule } from '../shared/contracts.ts';
import { connectorById, SOURCE_IDS, sourceForLibraryFile, type SourceId } from '../shared/platform.ts';
import { PROMPT_VERSION } from '../shared/prompts/extract.ts';
import { coerceTaxonomy } from '../shared/prompts/taxonomy.ts';
import { LIVE_FALLBACK_AFTER_MS } from '../shared/scoring.ts';
import { effectiveRules } from '../pipeline/route.ts';
import type { ConnectionState, Taxonomy } from '../pipeline/types.ts';
import { byteLength, randomId, sha256Hex } from '../pipeline/util.ts';
import { reserve, runEstimate, settle } from './budget.ts';
import { connectionStates, getConnectionStates } from './connections.ts';
import { getAccounts, getLibraryFile, getRawContent, getRules, getRunRow, getSetting, insertRun, insertRunStatement, nowIso, rowToRun, SEED, updateRunRow, type RunRow } from './db.ts';
import { getEffectivePeople } from './directory.ts';
import { claimWorkflow, createClaimedWorkflow, fastPath, type PipelineParams } from './execute.ts';
import type { Env } from './env.ts';
import { getRecording, materializeReplay, replayRunFields } from './replay.ts';
import type { Reporter } from './platform/sdk.ts';

export type Thresholds = { autoRoute: number; review: number; grounding: number };

export type RunContext = {
  account: Account | null;
  accounts: Account[];
  /** The workspace's directory (seed with this workspace's edits; inactive people included). */
  people: Person[];
  rules: RoutingRule[];
  /** The workspace's connectors: routing skips channels that are not connected. */
  connections: ConnectionState[];
  taxonomy: Taxonomy;
  promptVersion: string;
  thresholds: Thresholds;
};

export async function loadContext(env: Env, ws: string, accountId: string | null): Promise<RunContext> {
  const [accounts, people, rules, connections, taxonomyRaw, promptVersion, thresholds] = await Promise.all([
    getAccounts(env.DB),
    getEffectivePeople(env.DB, ws),
    getRules(env.DB, ws),
    getConnectionStates(env.DB, ws),
    getSetting<unknown>(env.DB, 'taxonomy', null),
    getSetting<string>(env.DB, 'prompt_version', PROMPT_VERSION),
    getSetting<Thresholds>(env.DB, 'thresholds', { ...THRESHOLDS }),
  ]);
  return {
    account: accountId ? accounts.find((a) => a.id === accountId) ?? null : null,
    accounts,
    people,
    rules: effectiveRules(rules.seed, rules.own),
    connections: connectionStates(connections),
    taxonomy: coerceTaxonomy(taxonomyRaw),
    promptVersion,
    thresholds,
  };
}

/** Best-effort account match for pasted text: the full name, or a distinctive first word. */
export function detectAccount(text: string, accounts: Account[]): Account | null {
  const lower = text.toLowerCase();
  for (const a of accounts) if (lower.includes(a.name.toLowerCase())) return a;
  for (const a of accounts) {
    const first = a.name.split(/\s+/)[0]!;
    if (first.length >= 5 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) return a;
  }
  return null;
}

export type CreateResult =
  | { ok: true; runId: string; mode: 'live' | 'replay'; modeReason: string | null; duplicate: boolean; duplicateScope?: 'workspace' | 'seed'; duplicateCreatedAt?: string }
  | { ok: false; status: 400 | 404 | 409 | 429 | 503; code: string; message: string };

type CreateInput = ({ fileId: string; mode: 'auto' | 'replay' } | { text: string; filename: string; mode: 'auto'; formatHint?: FileFormat; sourceFormat?: string; source?: string }) & { rerun?: boolean };

/**
 * The newest earlier run of the same bytes, in this workspace first, then seeded history.
 * With `rerun`, this workspace's own earlier runs of the same file (same library file id, or
 * pasted text) are skipped, so the viewer gets a genuinely new run. Seeded history, and a
 * different file with the same bytes (the duplicate re-upload test), still dedupe.
 */
async function existingRunBySha(env: Env, ws: string, sha: string, rerun: { fileId: string | null } | null): Promise<RunRow | null> {
  const r = await env.DB.prepare(
    "SELECT * FROM runs WHERE workspace_id IN (?1, ?2) AND sha256 = ?3 AND status != 'failed' AND NOT (?4 = 1 AND workspace_id = ?2 AND COALESCE(file_id, '') = ?5) ORDER BY CASE WHEN workspace_id = ?2 THEN 0 ELSE 1 END, created_at DESC LIMIT 1",
  )
    .bind(SEED, ws, sha, rerun ? 1 : 0, rerun?.fileId ?? '')
    .first<Record<string, unknown>>();
  return r ? rowToRun(r) : null;
}

function baseRun(o: {
  id: string; ws: string; file: LibraryFile | null; filename: string; accountId: string | null; sha: string; promptVersion: string; mode: 'live' | 'replay'; modeReason: string | null; createdAt: string;
  formatHint?: FileFormat | null; source: SourceId; sourceFormat?: string | null;
}): RunRow {
  return {
    id: o.id, workspaceId: o.ws, fileId: o.file?.id ?? null, filename: o.filename, accountId: o.accountId, callId: o.file?.callId ?? null, status: 'queued', mode: o.mode,
    modeReason: o.modeReason, sha256: o.sha, createdAt: o.createdAt, finishedAt: null, durationMs: null, costUsd: 0, promptVersion: o.promptVersion, insightCount: 0, droppedCount: 0,
    reviewCount: 0, injectionFlagged: false, actionable: null, source: o.source, docKind: null, sourceFormat: o.sourceFormat ?? null, replayOf: null, workflowId: null, error: null,
    // The format column doubles as the run's parser hint: a library file's format, or the browser converter's hint.
    format: o.file?.format ?? o.formatHint ?? null, screen: null, keyScope: 'runtime',
  };
}

/**
 * Where a new run came from. Library files: their source mapping (sourceForLibraryFile).
 * Text: the declared source, which must be a known source and, when it is a connector, one that
 * is connected in this workspace; else 'upload' for a converted file, 'paste' for pasted text.
 */
async function runSource(env: Env, ws: string, file: LibraryFile | null, input: CreateInput): Promise<{ ok: true; source: SourceId } | { ok: false; status: 400 | 409; code: string; message: string }> {
  if (file) return { ok: true, source: sourceForLibraryFile(file.filename, file.format) };
  const t = input as { source?: string; sourceFormat?: string };
  if (!t.source) return { ok: true, source: t.sourceFormat ? 'upload' : 'paste' };
  if (!(SOURCE_IDS as readonly string[]).includes(t.source)) return { ok: false, status: 400, code: 'invalid_request', message: `source: unknown source "${t.source}"` };
  const def = connectorById(t.source);
  if (def) {
    const state = (await getConnectionStates(env.DB, ws)).find((c) => c.id === def.id);
    if (state?.status !== 'connected') return { ok: false, status: 409, code: 'source_not_connected', message: `${def.name} isn't connected. Connect it first, or upload the file.` };
  }
  return { ok: true, source: t.source as SourceId };
}

export async function startReplay(env: Env, run: RunRow, fileId: string, reason: string, startMs = Date.now()): Promise<boolean> {
  const rec = await getRecording(env.DB, fileId);
  if (!rec) return false;
  const f = replayRunFields(rec, startMs);
  const row: RunRow = { ...run, ...f, mode: 'replay', modeReason: reason, replayOf: fileId, createdAt: new Date(startMs).toISOString(), screen: rec.screen, format: f.format };
  await insertRun(env.DB, row);
  await materializeReplay(env.DB, row, rec, startMs);
  return true;
}

/**
 * Create a run. Live runs start executing immediately on the fast path inside `waitUntil`
 * (see execute.ts); the durable Workflow is only created if the fast path hands off.
 */
export async function createRun(env: Env, ws: string, input: CreateInput, rep: Reporter, traceId: string, waitUntil: (p: Promise<unknown>) => void = () => {}): Promise<CreateResult> {
  const runId = randomId('run');
  const now = Date.now();
  let file: (LibraryFile & { sha256: string }) | null = null;
  let filename: string;
  let sha: string;
  let accountId: string | null = null;
  if ('fileId' in input) {
    file = await getLibraryFile(env.DB, input.fileId);
    if (!file) return { ok: false, status: 404, code: 'not_found', message: 'No such library file' };
    filename = file.filename;
    sha = file.sha256;
    accountId = file.accountId;
  } else {
    filename = input.filename;
    sha = await sha256Hex(input.text);
    const accounts = await getAccounts(env.DB);
    accountId = detectAccount(input.text, accounts)?.id ?? null;
  }

  // Idempotency: the same bytes were already processed (by this viewer, or in seeded history).
  // The duplicate check, prompt version and raw bytes are independent reads: one round trip.
  const [existing, promptVersion, libraryContent] = await Promise.all([
    existingRunBySha(env, ws, sha, input.rerun ? { fileId: file?.id ?? null } : null),
    getSetting<string>(env.DB, 'prompt_version', PROMPT_VERSION),
    file ? getRawContent(env.DB, sha) : Promise.resolve(null),
  ]);
  if (existing) {
    // 'workspace' only when it's this viewer's own run of the same file: that's what a rerun bypasses.
    const scope = existing.workspaceId === ws && (existing.fileId ?? null) === (file?.id ?? null) ? 'workspace' : 'seed';
    rep.log({ level: 'info', component: 'api', event: 'run.duplicate', message: `duplicate upload of ${filename}; returning ${existing.id}`, traceId, spanId: null, runId: existing.id, workspaceId: ws, durationMs: null, fields: { sha256: sha, scope, rerun: !!input.rerun } });
    return { ok: true, runId: existing.id, mode: existing.mode, modeReason: existing.modeReason, duplicate: true, duplicateScope: scope, duplicateCreatedAt: existing.createdAt };
  }

  const createdAt = new Date(now).toISOString();
  const src = await runSource(env, ws, file, input);
  if (!src.ok) return src;
  const text = 'fileId' in input ? null : input;
  const base = baseRun({ id: runId, ws, file, filename, accountId, sha, promptVersion, mode: 'live', modeReason: null, createdAt, formatHint: text?.formatHint ?? null, source: src.source, sourceFormat: text?.sourceFormat ?? null });

  if (file && input.mode === 'replay') {
    if (await startReplay(env, base, file.id, 'requested', now)) return { ok: true, runId, mode: 'replay', modeReason: 'requested', duplicate: false };
    return { ok: false, status: 404, code: 'no_recording', message: 'This file has no recorded run to replay' };
  }

  // Budget gate (atomic reservation, sized from this run's input).
  const content = file ? libraryContent ?? '' : (input as { text: string }).text;
  const r = await reserve(env, runId, runEstimate(env, content.length), now);
  rep.log({ level: 'info', component: 'budget', event: 'budget.check', message: r.ok ? 'reserved one run' : `live unavailable: ${r.reason}`, traceId, spanId: null, runId, workspaceId: ws, durationMs: null, fields: { allowed: r.ok, reason: r.ok ? null : r.reason } });
  if (!r.ok && r.reason === 'busy') {
    rep.log({ level: 'warn', component: 'budget', event: 'budget.busy', message: `live AI at capacity; ${file ? 'replaying recording' : 'custom text asked to retry'}`, traceId, spanId: null, runId, workspaceId: ws, durationMs: null, fields: { reason: r.reason } });
    if (file && (await startReplay(env, base, file.id, 'live_busy', now))) return { ok: true, runId, mode: 'replay', modeReason: 'live_busy', duplicate: false };
    return { ok: false, status: 429, code: 'live_busy', message: 'Live AI is busy with other viewers right now. Try again in a minute, or pick a library file to see a recorded run.' };
  }
  if (!r.ok) {
    rep.log({ level: 'warn', component: 'budget', event: 'budget.reached', message: `live AI off (${r.reason}); ${file ? 'replaying recording' : 'custom text rejected'}`, traceId, spanId: null, runId, workspaceId: ws, durationMs: null, fields: { reason: r.reason } });
    const reason = r.reason === 'disabled_by_owner' ? 'live_disabled' : 'budget_reached';
    if (file && (await startReplay(env, base, file.id, reason, now))) return { ok: true, runId, mode: 'replay', modeReason: reason, duplicate: false };
    return { ok: false, status: 409, code: 'budget_reached', message: r.reason === 'disabled_by_owner' ? 'Live AI is switched off. Pick a file from the library to see a recorded run.' : 'The live AI budget for this demo has been used. Library files still run as recorded replays.' };
  }

  if (!env.OPENROUTER_API_KEY) {
    await settle(env, runId);
    if (file && (await startReplay(env, base, file.id, 'live_failed', now))) return { ok: true, runId, mode: 'replay', modeReason: 'live_failed', duplicate: false };
    return { ok: false, status: 503, code: 'live_unavailable', message: 'Live AI is not configured on this deployment' };
  }

  // Live: store the raw bytes (pasted text), insert the run, start the fast path.
  const writes = [insertRunStatement(env.DB, base)];
  if (!file) writes.unshift(env.DB.prepare('INSERT OR IGNORE INTO raw_files (sha256, filename, size_bytes, content, created_at) VALUES (?,?,?,?,?)').bind(sha, filename, byteLength(content), content, nowIso()));
  await env.DB.batch(writes);
  waitUntil(fastPath(env, runId, ws, { run: base, content }));
  return { ok: true, runId, mode: 'live', modeReason: null, duplicate: false };
}

/** Remove everything a (failed or slow) live run wrote, keeping the run row and its ledger. */
async function clearRunOutputs(db: D1Database, runId: string): Promise<void> {
  const { results } = await db.prepare('SELECT id FROM insights WHERE run_id = ?').bind(runId).all<{ id: string }>();
  const ids = results.map((r) => r.id);
  const stmts = [
    db.prepare('DELETE FROM run_steps WHERE run_id = ?').bind(runId),
    db.prepare('DELETE FROM transcripts WHERE run_id = ?').bind(runId),
    db.prepare('DELETE FROM redaction_vault WHERE run_id = ?').bind(runId),
    db.prepare('DELETE FROM insights WHERE run_id = ?').bind(runId),
  ];
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const q = chunk.map(() => '?').join(',');
    stmts.push(db.prepare(`DELETE FROM deliveries WHERE insight_id IN (${q})`).bind(...chunk));
    stmts.push(db.prepare(`DELETE FROM notifications WHERE json_extract(data, '$.insightId') IN (${q})`).bind(...chunk));
  }
  await db.batch(stmts);
}

/**
 * Live → replay fallback, evaluated whenever a run is read: a featured-file live run that failed
 * or has not finished within ~25s is converted in place into a replay of its recording.
 */
export async function maybeFallback(env: Env, run: RunRow, rep: Reporter, traceId: string, now = Date.now()): Promise<RunRow> {
  if (run.mode !== 'live') return run;
  if (!run.fileId) return recoverStalled(env, run, rep, traceId, now);
  const limit = Number(env.LIVE_FALLBACK_MS ?? '') || LIVE_FALLBACK_AFTER_MS;
  const slow = (run.status === 'queued' || run.status === 'running') && now - Date.parse(run.createdAt) > limit;
  if (!slow && run.status !== 'failed') return run;
  const rec = await getRecording(env.DB, run.fileId);
  if (!rec) return run;
  // Claim the conversion atomically so concurrent polls do it once.
  const claimed = await env.DB.prepare("UPDATE runs SET mode = 'replay', mode_reason = 'live_failed' WHERE id = ? AND mode = 'live'").bind(run.id).run();
  if ((claimed.meta.changes ?? 0) !== 1) return (await getRunRow(env.DB, run.id)) ?? run;
  rep.log({ level: 'warn', component: 'workflow', event: 'run.fallback_replay', message: `live run ${slow ? 'exceeded the time limit' : 'failed'}; replaying the recording`, traceId, spanId: null, runId: run.id, workspaceId: run.workspaceId, durationMs: now - Date.parse(run.createdAt), fields: { reason: slow ? 'slow' : 'failed', error: run.error } });
  if (run.workflowId) {
    try {
      await (await env.PIPELINE.get(run.workflowId)).terminate();
    } catch {
      /* already finished or unknown */
    }
  }
  await clearRunOutputs(env.DB, run.id);
  await settle(env, run.id);
  const f = replayRunFields(rec, now);
  const updated: RunRow = { ...run, ...f, mode: 'replay', modeReason: 'live_failed', replayOf: run.fileId, createdAt: new Date(now).toISOString(), screen: rec.screen, format: f.format, error: null };
  await updateRunRow(env.DB, run.id, { ...f, createdAt: updated.createdAt, screen: rec.screen, replayOf: run.fileId, error: null });
  await materializeReplay(env.DB, updated, rec, now);
  return updated;
}

/** A fast path that has made no progress for this long is presumed dead (waitUntil ends at 30s). */
export const STALLED_AFTER_MS = 40_000;

/**
 * Pasted-text runs have no recording to fall back to. If the fast path died without finishing
 * or handing off (no workflowId), hand the run to the durable Workflow from the first step.
 */
export async function recoverStalled(env: Env, run: RunRow, rep: Reporter, traceId: string, now = Date.now()): Promise<RunRow> {
  if (run.workflowId || (run.status !== 'queued' && run.status !== 'running')) return run;
  const stalledAfter = Number(env.STALLED_AFTER_MS ?? '') || STALLED_AFTER_MS;
  if (now - Date.parse(run.createdAt) < stalledAfter) return run;
  const last = await env.DB.prepare('SELECT MAX(COALESCE(finished_at, started_at)) AS at FROM run_steps WHERE run_id = ?').bind(run.id).first<{ at: string | null }>();
  if (last?.at && now - Date.parse(last.at) < stalledAfter) return run;
  // Deterministic instance id, claimed before creation (the fast path claims `<runId>`).
  const instanceId = `${run.id}-r`;
  if (!(await claimWorkflow(env, run.id, instanceId))) return (await getRunRow(env.DB, run.id)) ?? run;
  rep.log({ level: 'warn', component: 'workflow', event: 'run.handoff', message: 'fast path stalled; restarting the run on the durable workflow', traceId, spanId: null, runId: run.id, workspaceId: run.workspaceId, durationMs: now - Date.parse(run.createdAt), fields: { at: 'ingest', reason: 'stalled', completedSteps: 0, resumed: false } });
  await clearRunOutputs(env.DB, run.id);
  try {
    const params: PipelineParams = { runId: run.id, workspaceId: run.workspaceId, handoff: { at: 'ingest', reason: 'stalled', error: null } };
    await createClaimedWorkflow(env, instanceId, params);
    await updateRunRow(env.DB, run.id, { status: 'queued' }, { onlyIfLive: true });
    return { ...run, workflowId: instanceId, status: 'queued' };
  } catch (err) {
    await updateRunRow(env.DB, run.id, { status: 'failed', error: 'the pipeline stalled and could not be restarted' });
    await settle(env, run.id);
    rep.log({ level: 'error', component: 'workflow', event: 'workflow.create_failed', message: String(err).slice(0, 200), traceId, spanId: null, runId: run.id, workspaceId: run.workspaceId, durationMs: null, fields: {} });
    return (await getRunRow(env.DB, run.id)) ?? run;
  }
}
