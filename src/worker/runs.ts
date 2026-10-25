/**
 * Run lifecycle: create (idempotent by sha256, budget-gated, live or replay), the live → replay
 * fallback, and the context a pipeline run needs (account, people, effective rules, taxonomy).
 */
import { THRESHOLDS, type Account, type LibraryFile, type Person, type RoutingRule } from '../shared/contracts.ts';
import { PROMPT_VERSION } from '../shared/prompts/extract.ts';
import { coerceTaxonomy } from '../shared/prompts/taxonomy.ts';
import { LIVE_FALLBACK_AFTER_MS } from '../shared/scoring.ts';
import { effectiveRules } from '../pipeline/route.ts';
import type { Taxonomy } from '../pipeline/types.ts';
import { byteLength, randomId, sha256Hex } from '../pipeline/util.ts';
import { reserve, settle } from './budget.ts';
import { getAccounts, getLibraryFile, getPeople, getRawContent, getRules, getRunRow, getSetting, insertRun, nowIso, SEED, updateRunRow, type RunRow } from './db.ts';
import type { Env } from './env.ts';
import { getRecording, materializeReplay, replayRunFields } from './replay.ts';
import type { Reporter } from './platform/sdk.ts';

export type Thresholds = { autoRoute: number; review: number; grounding: number };

export type RunContext = {
  account: Account | null;
  accounts: Account[];
  people: Person[];
  rules: RoutingRule[];
  taxonomy: Taxonomy;
  promptVersion: string;
  thresholds: Thresholds;
};

export async function loadContext(env: Env, ws: string, accountId: string | null): Promise<RunContext> {
  const [accounts, people, rules, taxonomyRaw, promptVersion, thresholds] = await Promise.all([
    getAccounts(env.DB),
    getPeople(env.DB),
    getRules(env.DB, ws),
    getSetting<unknown>(env.DB, 'taxonomy', null),
    getSetting<string>(env.DB, 'prompt_version', PROMPT_VERSION),
    getSetting<Thresholds>(env.DB, 'thresholds', { ...THRESHOLDS }),
  ]);
  return {
    account: accountId ? accounts.find((a) => a.id === accountId) ?? null : null,
    accounts,
    people,
    rules: effectiveRules(rules.seed, rules.own),
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
  | { ok: true; runId: string; mode: 'live' | 'replay'; modeReason: string | null; duplicate: boolean }
  | { ok: false; status: 400 | 404 | 409 | 429 | 503; code: string; message: string };

type CreateInput = { fileId: string; mode: 'auto' | 'replay' } | { text: string; filename: string; mode: 'auto' };

async function existingRunBySha(env: Env, ws: string, sha: string): Promise<RunRow | null> {
  const r = await env.DB.prepare("SELECT id FROM runs WHERE workspace_id IN (?, ?) AND sha256 = ? AND status != 'failed' ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, created_at DESC LIMIT 1").bind(SEED, ws, sha, ws).first<{ id: string }>();
  return r ? getRunRow(env.DB, r.id) : null;
}

function baseRun(o: { id: string; ws: string; file: LibraryFile | null; filename: string; accountId: string | null; sha: string; promptVersion: string; mode: 'live' | 'replay'; modeReason: string | null; createdAt: string }): RunRow {
  return {
    id: o.id, workspaceId: o.ws, fileId: o.file?.id ?? null, filename: o.filename, accountId: o.accountId, callId: o.file?.callId ?? null, status: 'queued', mode: o.mode,
    modeReason: o.modeReason, sha256: o.sha, createdAt: o.createdAt, finishedAt: null, durationMs: null, costUsd: 0, promptVersion: o.promptVersion, insightCount: 0, droppedCount: 0,
    reviewCount: 0, injectionFlagged: false, actionable: null, replayOf: null, workflowId: null, error: null, format: o.file?.format ?? null, screen: null, keyScope: 'runtime',
  };
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

export async function createRun(env: Env, ws: string, input: CreateInput, rep: Reporter, traceId: string): Promise<CreateResult> {
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
  const existing = await existingRunBySha(env, ws, sha);
  if (existing) {
    rep.log({ level: 'info', component: 'api', event: 'run.duplicate', message: `duplicate upload of ${filename}; returning ${existing.id}`, traceId, spanId: null, runId: existing.id, workspaceId: ws, durationMs: null, fields: { sha256: sha } });
    return { ok: true, runId: existing.id, mode: existing.mode, modeReason: existing.modeReason, duplicate: true };
  }

  const promptVersion = await getSetting<string>(env.DB, 'prompt_version', PROMPT_VERSION);
  const createdAt = new Date(now).toISOString();
  const base = baseRun({ id: runId, ws, file, filename, accountId, sha, promptVersion, mode: 'live', modeReason: null, createdAt });

  if (file && input.mode === 'replay') {
    if (await startReplay(env, base, file.id, 'requested', now)) return { ok: true, runId, mode: 'replay', modeReason: 'requested', duplicate: false };
    return { ok: false, status: 404, code: 'no_recording', message: 'This file has no recorded run to replay' };
  }

  // Budget gate (atomic reservation).
  const r = await reserve(env, runId, undefined, now);
  rep.log({ level: 'info', component: 'budget', event: 'budget.check', message: r.ok ? 'reserved one run' : `live unavailable: ${r.reason}`, traceId, spanId: null, runId, workspaceId: ws, durationMs: null, fields: { allowed: r.ok, reason: r.ok ? null : r.reason } });
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

  // Live: store the raw bytes, insert the run, start the Workflow.
  const content = file ? (await getRawContent(env.DB, sha)) ?? '' : (input as { text: string }).text;
  if (!file) await env.DB.prepare('INSERT OR IGNORE INTO raw_files (sha256, filename, size_bytes, content, created_at) VALUES (?,?,?,?,?)').bind(sha, filename, byteLength(content), content, nowIso()).run();
  await insertRun(env.DB, base);
  try {
    const instance = await env.PIPELINE.create({ id: runId, params: { runId, workspaceId: ws } });
    await updateRunRow(env.DB, runId, { workflowId: instance.id });
    return { ok: true, runId, mode: 'live', modeReason: null, duplicate: false };
  } catch (err) {
    rep.log({ level: 'error', component: 'workflow', event: 'workflow.create_failed', message: String(err).slice(0, 200), traceId, spanId: null, runId, workspaceId: ws, durationMs: null, fields: {} });
    await settle(env, runId);
    if (file) {
      await env.DB.prepare('DELETE FROM runs WHERE id = ?').bind(runId).run();
      if (await startReplay(env, base, file.id, 'live_failed', now)) return { ok: true, runId, mode: 'replay', modeReason: 'live_failed', duplicate: false };
    }
    await updateRunRow(env.DB, runId, { status: 'failed', error: 'could not start the pipeline' });
    return { ok: false, status: 503, code: 'live_unavailable', message: 'The pipeline could not start. Try again shortly.' };
  }
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
  if (run.mode !== 'live' || !run.fileId) return run;
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
