import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  CreateRun, ReviewAction, RoutingRule, THRESHOLDS, type ArrBand, type CreateRunResult, type Delivery, type Envelope, type EvalRun, type Insight, type LibraryFile, type Session,
} from '../../shared/contracts.ts';
import { TelemetryBatch } from '../../shared/platform-contracts.ts';
import { platformApi } from '../platform/api.ts';
import { CANDIDATE_PROMPT_VERSION, PROMPT_VERSION } from '../../shared/prompts/extract.ts';
import { LIVE_FALLBACK_AFTER_MS, MINUTES_SAVED_PER_CALL, PROMOTION_GATE, RUN_COST_ESTIMATE_USD, THEME_JOIN_THRESHOLD, TYPE_PRIORS } from '../../shared/scoring.ts';
import { effectiveRules, previewFlows } from '../../pipeline/route.ts';
import { enrichDelivery } from '../../pipeline/deliver.ts';
import { percentile } from '../../pipeline/util.ts';
import { getBudget, setLive } from '../budget.ts';
import {
  audit, getAccounts, getInsight, getLibraryFile, getPeople, getRawContent, getRules, getRunRow, getSetting, j, nowIso, publicRun, putSetting, queryDeliveries, queryInsights,
  queryNotifications, queryReviews, rowToRun, SEED,
} from '../db.ts';
import { EMBED_MODEL } from '../deps.ts';
import type { ApiEnv } from '../env.ts';
import { runDetail } from '../replay.ts';
import { applyReview, changeTicket } from '../review.ts';
import { createRun, maybeFallback } from '../runs.ts';
import { newWorkspaceId, readCookie, verifyWorkspace, workspaceCookie, WS_COOKIE } from '../gate.ts';
import { newSpanId, newTraceId, signalReporter, type TraceCtx } from '../telemetry.ts';
import { themesView } from '../themes.ts';

type Vars = { ws: string; trace: TraceCtx };
type C = Context<{ Bindings: ApiEnv; Variables: Vars }>;

/** The gated JSON API, mounted under /repo/invoca/api. */
export const api = new Hono<{ Bindings: ApiEnv; Variables: Vars }>().basePath('/repo/invoca/api');


function ok<T>(c: C, data: T, status: 200 | 201 = 200): Response {
  const body: Envelope<T> = { data, dataAsOf: nowIso() };
  return c.json(body, status);
}

function fail(c: C, status: 400 | 403 | 404 | 409 | 429 | 500 | 503, code: string, message: string): Response {
  return c.json({ error: { code, message } }, status);
}

function issues(err: z.ZodError): string {
  return err.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

async function body<T>(c: C, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, res: fail(c, 400, 'invalid_request', 'Body must be JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: fail(c, 400, 'invalid_request', issues(parsed.error)) };
  return { ok: true, data: parsed.data };
}

const actorOf = (c: C) => (c.env.ACCESS.via === 'owner' ? 'owner' : `viewer:${c.get('ws').replace(/^ws_/, '').slice(0, 6)}`);

// ------------------------------------------------------------------ middleware: trace + workspace

api.use('*', async (c, next) => {
  const t0 = Date.now();
  const rep = signalReporter(c.env);
  const traceId = newTraceId();
  const rootSpan = newSpanId();
  // Workspace cookie: a random id per viewer session, HMAC-signed (gate.ts); set on first API
  // call. An unsigned (legacy) or forged value is never trusted: that viewer gets a fresh one.
  let ws = await verifyWorkspace(readCookie(c.req.header('cookie') ?? '', WS_COOKIE), c.env.LINK_SIGNING_SECRET);
  if (!ws) {
    ws = newWorkspaceId();
    c.header('set-cookie', await workspaceCookie(ws, c.env.LINK_SIGNING_SECRET), { append: true });
  }
  c.set('ws', ws);
  c.set('trace', { rep, traceId, parentId: rootSpan, runId: null, workspaceId: ws });
  let status = 500;
  try {
    await next();
    status = c.res.status;
  } finally {
    c.header('x-trace-id', traceId);
    const ms = Date.now() - t0;
    const route = `${c.req.method} ${c.req.routePath.replace('/repo/invoca/api', '') || '/'}`;
    rep.span({ traceId, spanId: rootSpan, parentId: null, name: route, start: new Date(t0).toISOString(), durationMs: ms, status: status >= 500 ? 'error' : 'ok', attrs: { 'http.status': status, workspace: ws, via: c.env.ACCESS.via } });
    rep.log({ level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', component: 'api', event: 'http.request', message: `${route} → ${status} (${ms}ms)`, traceId, spanId: rootSpan, runId: null, workspaceId: ws, durationMs: ms, fields: { route, status, path: c.req.path, via: c.env.ACCESS.via } });
    try {
      c.executionCtx.waitUntil(rep.flush());
    } catch {
      await rep.flush();
    }
  }
});

// ------------------------------------------------------------------ session, world, library

api.get('/ping', (c) => ok(c, { ok: true, via: c.env.ACCESS.via }));

api.get('/session', async (c) => {
  const session: Session = {
    workspaceId: c.get('ws'),
    isOwner: c.env.ACCESS.via === 'owner',
    budget: await getBudget(c.env),
    models: { primary: c.env.MODEL_PRIMARY, secondary: c.env.MODEL_SECONDARY },
    promptVersion: await getSetting<string>(c.env.DB, 'prompt_version', PROMPT_VERSION),
    linkExpiresAt: c.env.ACCESS.linkExpiresAt,
  };
  return ok(c, session);
});

api.get('/world', async (c) => ok(c, { accounts: await getAccounts(c.env.DB), people: await getPeople(c.env.DB) }));

api.get('/library', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT data FROM library_files WHERE featured = 1 ORDER BY sort_key').all<{ data: string }>();
  return ok(c, results.map((r) => j<LibraryFile>(r.data, null as unknown as LibraryFile)));
});

api.get('/library/:id', async (c) => {
  const f = await getLibraryFile(c.env.DB, c.req.param('id'));
  if (!f) return fail(c, 404, 'not_found', 'No such library file');
  const content = await getRawContent(c.env.DB, f.sha256);
  const { sha256: _s, ...file } = f;
  return ok(c, { file, content: content ?? '' });
});

// ------------------------------------------------------------------ runs

api.post('/runs', async (c) => {
  const ws = c.get('ws');
  // Per workspace and per client IP (a new workspace is one cookie-clear away). Fails closed.
  let allowed = false;
  try {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? 'unknown';
    const [byWs, byIp] = await Promise.all([c.env.RL_RUNS.limit({ key: `ws:${ws}` }), c.env.RL_RUNS_IP.limit({ key: `ip:${ip}` })]);
    allowed = byWs.success && byIp.success;
  } catch {
    allowed = false;
  }
  if (!allowed) return fail(c, 429, 'rate_limited', 'Too many runs in a minute. Wait a moment and try again.');
  const b = await body(c, CreateRun);
  if (!b.ok) return b.res;
  const t = c.get('trace');
  const r = await createRun(c.env, ws, b.data, t.rep, t.traceId, (p) => c.executionCtx.waitUntil(p));
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  t.rep.track({ sessionId: ws, actorId: actorOf(c), actorRole: c.env.ACCESS.via === 'owner' ? 'owner' : 'viewer', kind: 'run_created', path: null, props: { runId: r.runId, mode: r.mode, duplicate: r.duplicate, rerun: !!b.data.rerun, fileId: 'fileId' in b.data ? b.data.fileId : null }, durationMs: null });
  // (duplicates are logged as run.duplicate inside createRun)
  if (!r.duplicate) t.rep.log({
    level: r.mode === 'replay' && r.modeReason !== 'requested' ? 'warn' : 'info', component: 'api', event: r.mode === 'replay' ? 'run.replay' : 'run.started',
    message: r.mode === 'replay' ? `replaying the recorded run (${r.modeReason})` : 'live run started', traceId: t.traceId, spanId: null, runId: r.runId, workspaceId: ws, durationMs: null,
    fields: { mode: r.mode, modeReason: r.modeReason, duplicate: r.duplicate, fileId: 'fileId' in b.data ? b.data.fileId : null },
  });
  const out: CreateRunResult = { runId: r.runId, mode: r.mode, modeReason: r.modeReason, duplicate: r.duplicate, duplicateScope: r.duplicateScope ?? null, duplicateCreatedAt: r.duplicateCreatedAt ?? null };
  return ok(c, out, r.duplicate ? 200 : 201);
});

/** `b64url(createdAt|id)` → parts, or null for anything malformed. */
export function decodeRunsCursor(cursor: string): { at: string; id: string } | null {
  if (cursor.length > 200 || !/^[A-Za-z0-9_-]+=*$/.test(cursor)) return null;
  let raw: string;
  try {
    raw = atob(cursor.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const [at, id, extra] = raw.split('|');
  if (extra !== undefined || !at || !id || !Number.isFinite(Date.parse(at)) || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return { at, id };
}

api.get('/runs', async (c) => {
  const ws = c.get('ws');
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50));
  const cursor = c.req.query('cursor');
  let where = 'workspace_id IN (?, ?)';
  const binds: unknown[] = [SEED, ws];
  if (cursor) {
    const parsed = decodeRunsCursor(cursor);
    if (!parsed) return fail(c, 400, 'invalid_cursor', 'The cursor is not valid; start from the first page');
    where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
    binds.push(parsed.at, parsed.at, parsed.id);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM runs WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...binds, limit + 1).all<Record<string, unknown>>();
  const nowMs = Date.now();
  const rows = results.slice(0, limit).map((r) => {
    const run = publicRun(rowToRun(r));
    // A replay still revealing its timeline lists as running, exactly like a live run would.
    if (run.mode === 'replay' && run.finishedAt && Date.parse(run.finishedAt) > nowMs) return { ...run, status: 'running' as const, finishedAt: null, durationMs: null };
    return run;
  });
  const last = rows[rows.length - 1];
  if (results.length > limit && last) c.header('x-next-cursor', btoa(`${last.createdAt}|${last.id}`).replace(/\+/g, '-').replace(/\//g, '_'));
  return ok(c, rows);
});

api.get('/runs/:id', async (c) => {
  const ws = c.get('ws');
  let run = await getRunRow(c.env.DB, c.req.param('id'));
  if (!run || (run.workspaceId !== ws && run.workspaceId !== SEED)) return fail(c, 404, 'not_found', 'No such run');
  if (run.workspaceId === ws) {
    const t = c.get('trace');
    run = await maybeFallback(c.env, run, t.rep, t.traceId);
  }
  return ok(c, await runDetail(c.env.DB, ws, run));
});

// ------------------------------------------------------------------ insights & review

const InsightQuery = z.object({
  type: z.string().optional(), area: z.string().optional(), status: z.string().optional(), account: z.string().optional(), q: z.string().max(200).optional(), runId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

function visible<T extends { createdAt: string }>(rows: T[], now = Date.now()): T[] {
  return rows.filter((r) => Date.parse(r.createdAt) <= now);
}

api.get('/insights', async (c) => {
  const p = InsightQuery.safeParse(c.req.query());
  if (!p.success) return fail(c, 400, 'invalid_request', issues(p.error));
  const f = p.data;
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.type) (where.push('type = ?'), binds.push(f.type));
  if (f.area) (where.push('product_area = ?'), binds.push(f.area));
  if (f.status) (where.push('status = ?'), binds.push(f.status));
  if (f.account) (where.push('account_id = ?'), binds.push(f.account));
  if (f.runId) (where.push('run_id = ?'), binds.push(f.runId));
  if (f.q) (where.push('data LIKE ?'), binds.push(`%${f.q.replace(/[%_]/g, '')}%`));
  const rows = await queryInsights(c.env.DB, c.get('ws'), where.join(' AND ') || '1=1', binds, f.limit ?? 500);
  const q = f.q?.toLowerCase();
  const out = visible(rows).filter(
    (i) => (!f.type || i.type === f.type) && (!f.area || i.productArea === f.area) && (!f.status || i.status === f.status) && (!f.account || i.accountId === f.account) && (!f.runId || i.runId === f.runId) &&
      (!q || i.summary.toLowerCase().includes(q) || i.evidence.some((e) => e.quote.toLowerCase().includes(q)) || i.rationale.toLowerCase().includes(q)),
  );
  return ok(c, out);
});

api.get('/insights/:id', async (c) => {
  const ws = c.get('ws');
  const insight = await getInsight(c.env.DB, ws, c.req.param('id'));
  if (!insight || Date.parse(insight.createdAt) > Date.now()) return fail(c, 404, 'not_found', 'No such insight');
  const run = await getRunRow(c.env.DB, insight.runId);
  const deliveries = await withPreviewFields(c.env.DB, ws, visible(await queryDeliveries(c.env.DB, ws, 'insight_id = ?', [insight.id])), [insight]);
  const reviews = (await queryReviews(c.env.DB, ws, insight.id)).filter((r) => r.workspaceId === ws || r.workspaceId === SEED);
  const theme = insight.themeId ? (await themesView(c.env.DB, ws, Date.now(), insight.themeId)).themes[0] ?? null : null;
  return ok(c, { insight, run: run ? publicRun(run) : null, deliveries, reviews, theme });
});

api.get('/review', async (c) => {
  const rows = await queryInsights(c.env.DB, c.get('ws'), "status = 'pending_review'");
  const out = visible(rows)
    .filter((i) => i.status === 'pending_review')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return ok(c, out);
});

api.post('/review/:insightId', async (c) => {
  const b = await body(c, ReviewAction);
  if (!b.ok) return b.res;
  const ws = c.get('ws');
  const t = c.get('trace');
  const r = await applyReview(c.env, ws, c.req.param('insightId'), b.data, actorOf(c), t);
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  if (!r.replayed) {
    const humanMinutes = Math.round(((b.data.dwellMs ?? 0) / 60_000) * 100) / 100;
    t.rep.track({ sessionId: ws, actorId: actorOf(c), actorRole: 'viewer', kind: 'review_action', path: null, props: { insightId: r.body.insight.id, action: b.data.action, type: r.body.insight.type }, durationMs: b.data.dwellMs ?? null });
    t.rep.track({ sessionId: ws, actorId: actorOf(c), actorRole: 'viewer', kind: r.outcome === 'accepted' ? 'output_accepted' : r.outcome === 'edited' ? 'output_edited' : 'output_rejected', path: null, props: { insightId: r.body.insight.id }, durationMs: b.data.dwellMs ?? null });
    t.rep.work({ kind: 'insight_reviewed', actorId: actorOf(c), minutesSavedEstimate: 0, humanMinutesSpent: humanMinutes, aiCostUsd: 0, outcome: r.outcome });
    t.rep.log({ level: 'info', component: 'api', event: 'review.action', message: `${b.data.action} ${r.body.insight.id}`, traceId: t.traceId, spanId: null, runId: r.body.insight.runId, workspaceId: ws, durationMs: b.data.dwellMs ?? null, fields: { action: b.data.action, outcome: r.outcome, delivered: !!r.body.delivery } });
  }
  return ok(c, r.body);
});

// ------------------------------------------------------------------ themes

api.get('/themes', async (c) => ok(c, (await themesView(c.env.DB, c.get('ws'))).themes));

api.get('/themes/:id', async (c) => {
  const id = c.req.param('id');
  const v = await themesView(c.env.DB, c.get('ws'), Date.now(), id);
  const theme = v.themes[0];
  if (!theme) return fail(c, 404, 'not_found', 'No such theme');
  const insights = (v.members.get(id) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ids = new Set(insights.map((i) => i.accountId));
  return ok(c, { theme, insights, accounts: v.accounts.filter((a) => ids.has(a.id)) });
});

// ------------------------------------------------------------------ routing

api.get('/routing/rules', async (c) => {
  const r = await getRules(c.env.DB, c.get('ws'));
  return ok(c, effectiveRules(r.seed, r.own));
});

api.put('/routing/rules/:id', async (c) => {
  const b = await body(c, RoutingRule);
  if (!b.ok) return b.res;
  const id = c.req.param('id');
  if (b.data.id !== id) return fail(c, 400, 'invalid_request', 'Rule id in the body must match the URL');
  const ws = c.get('ws');
  const r = await getRules(c.env.DB, ws);
  const before = effectiveRules(r.seed, r.own).find((x) => x.id === id) ?? null;
  const rule: RoutingRule = { ...b.data, workspaceId: ws };
  await c.env.DB.prepare('INSERT INTO routing_rules (workspace_id, id, priority, data, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id, id) DO UPDATE SET priority=excluded.priority, data=excluded.data, updated_at=excluded.updated_at')
    .bind(ws, id, rule.priority, JSON.stringify(rule), nowIso())
    .run();
  await audit(c.env.DB, { workspaceId: ws, actor: actorOf(c), action: 'rule.update', target: id, before, after: rule });
  c.get('trace').rep.track({ sessionId: ws, actorId: actorOf(c), actorRole: 'viewer', kind: 'rule_changed', path: null, props: { ruleId: id }, durationMs: null });
  return ok(c, rule);
});

api.post('/routing/preview', async (c) => {
  const b = await body(c, z.array(RoutingRule).max(200));
  if (!b.ok) return b.res;
  const ws = c.get('ws');
  const [insights, accounts, people] = await Promise.all([queryInsights(c.env.DB, ws, "status NOT IN ('dropped_ungrounded', 'rejected')", [], 1000), getAccounts(c.env.DB), getPeople(c.env.DB)]);
  const band = new Map<string, ArrBand>(accounts.map((a) => [a.id, a.arrBand]));
  const subjects = visible(insights)
    .filter((i) => i.status !== 'dropped_ungrounded' && i.status !== 'rejected')
    .map((i) => ({ type: i.type, productArea: i.productArea, severity: i.severity, arrBand: i.accountId ? band.get(i.accountId) ?? null : null }));
  const rules = [...b.data].sort((a, x) => a.priority - x.priority || a.id.localeCompare(x.id));
  return ok(c, { flows: previewFlows(subjects, rules, people), insights: subjects.length });
});

// ------------------------------------------------------------------ deliveries & notifications

/**
 * Delivery rows written before the flat preview fields existed (account, ARR, renewal, area,
 * confidence, CSM) get them from the insight/account join at read time, so every preview
 * renders real values for old and new rows alike.
 */
async function withPreviewFields(db: D1Database, ws: string, rows: Delivery[], known: Insight[] = []): Promise<Delivery[]> {
  const stale = rows.filter((d) => {
    const p = d.payload as Record<string, unknown>;
    return p.type === undefined || p.confidence === undefined;
  });
  if (!stale.length) return rows;
  const byId = new Map(known.map((i) => [i.id, i]));
  if (stale.some((d) => !byId.has(d.insightId))) for (const i of await queryInsights(db, ws, '1=1', [], 5000)) byId.set(i.id, i);
  const [accounts, people] = await Promise.all([getAccounts(db), getPeople(db)]);
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const ppl = new Map(people.map((p) => [p.id, p]));
  return rows.map((d) => {
    const ins = byId.get(d.insightId);
    if (!ins) return d;
    return enrichDelivery(d, ins, ins.accountId ? acc.get(ins.accountId) ?? null : null, ins.csmId ? ppl.get(ins.csmId) ?? null : null);
  });
}

api.get('/deliveries', async (c) => {
  const channel = c.req.query('channel');
  const rows = await queryDeliveries(c.env.DB, c.get('ws'), channel ? 'channel = ?' : '1=1', channel ? [channel] : []);
  const out = visible(rows).filter((d) => !channel || d.channel === channel);
  return ok(c, await withPreviewFields(c.env.DB, c.get('ws'), out));
});

const TicketBody = z.object({ state: z.enum(['open', 'in_progress', 'shipped', 'wont_do']) });

api.post('/deliveries/:id/ticket', async (c) => {
  const b = await body(c, TicketBody);
  if (!b.ok) return b.res;
  const ws = c.get('ws');
  const r = await changeTicket(c.env, ws, c.req.param('id'), b.data.state, actorOf(c));
  if (!r.ok) return fail(c, r.status, r.code, r.message);
  c.get('trace').rep.track({ sessionId: ws, actorId: actorOf(c), actorRole: 'viewer', kind: 'ticket_state', path: null, props: { deliveryId: r.delivery.id, state: b.data.state }, durationMs: null });
  const [delivery] = await withPreviewFields(c.env.DB, ws, [r.delivery]);
  return ok(c, { delivery, notification: r.notification });
});

api.get('/notifications', async (c) => {
  const rows = await queryNotifications(c.env.DB, c.get('ws'), c.req.query('csmId') ?? null);
  return ok(c, visible(rows));
});

// ------------------------------------------------------------------ evals, health, settings

api.get('/evals', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT role, data FROM eval_runs ORDER BY created_at DESC').all<{ role: string; data: string }>();
  const runs = results.map((r) => ({ role: r.role, run: j<EvalRun>(r.data, null as unknown as EvalRun) }));
  const latest = runs.find((r) => r.role === 'promoted')?.run;
  if (!latest) return fail(c, 404, 'not_found', 'No eval results have been loaded yet');
  return ok(c, { latest, history: runs.filter((r) => r.role !== 'candidate').map((r) => r.run), candidate: runs.find((r) => r.role === 'candidate')?.run ?? null });
});

api.get('/health', async (c) => {
  const db = c.env.DB;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [budget, calls, dlq, recent, runs] = await Promise.all([
    getBudget(c.env),
    db.prepare('SELECT substr(created_at, 1, 10) AS day, ms, ok, cost_usd, fallback FROM ai_calls WHERE created_at >= ?').bind(since).all<{ day: string; ms: number; ok: number; cost_usd: number; fallback: number }>(),
    db.prepare('SELECT id, run_id, workspace_id, step, error, created_at FROM dlq WHERE workspace_id IN (?, ?) ORDER BY created_at DESC LIMIT 50').bind(SEED, c.get('ws')).all<Record<string, unknown>>(),
    // Individual calls: the seeded history and this viewer's own runs only.
    db.prepare('SELECT id, run_id, purpose, model, tokens_in, tokens_out, cost_usd, ms, ok, error, fallback, schema_retry, key_scope, created_at FROM ai_calls WHERE workspace_id IN (?, ?) ORDER BY created_at DESC LIMIT 25').bind(SEED, c.get('ws')).all<Record<string, unknown>>(),
    db.prepare("SELECT status, mode, COUNT(*) AS n FROM runs WHERE workspace_id IN (?, ?) GROUP BY status, mode").bind(SEED, c.get('ws')).all<{ status: string; mode: string; n: number }>(),
  ]);
  const byDay = new Map<string, { ms: number[]; cost: number; failures: number; fallbacks: number }>();
  for (const r of calls.results) {
    const d = byDay.get(r.day) ?? { ms: [], cost: 0, failures: 0, fallbacks: 0 };
    d.ms.push(Number(r.ms));
    d.cost += Number(r.cost_usd);
    if (!Number(r.ok)) d.failures++;
    if (Number(r.fallback)) d.fallbacks++;
    byDay.set(r.day, d);
  }
  const ledger = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, d]) => ({ day, calls: d.ms.length, costUsd: Math.round(d.cost * 1e6) / 1e6, p50Ms: percentile(d.ms, 50), p95Ms: percentile(d.ms, 95), failures: d.failures, fallbacks: d.fallbacks }));
  return ok(c, {
    budget,
    ledger,
    dlq: dlq.results.map((r) => ({ id: String(r.id), runId: r.run_id as string | null, step: String(r.step), error: String(r.error), createdAt: String(r.created_at) })),
    recent: recent.results.map((r) => ({
      id: String(r.id), runId: r.run_id as string | null, purpose: String(r.purpose), model: String(r.model), tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out), costUsd: Number(r.cost_usd),
      ms: Number(r.ms), ok: Number(r.ok) === 1, error: r.error as string | null, fallback: Number(r.fallback) === 1, schemaRetry: Number(r.schema_retry) === 1, keyScope: String(r.key_scope), createdAt: String(r.created_at),
    })),
    runs: runs.results.map((r) => ({ status: r.status, mode: r.mode, count: Number(r.n) })),
  });
});

async function settingsView(c: C) {
  return {
    thresholds: await getSetting(c.env.DB, 'thresholds', { ...THRESHOLDS }),
    promptVersion: await getSetting<string>(c.env.DB, 'prompt_version', PROMPT_VERSION),
    candidatePromptVersion: CANDIDATE_PROMPT_VERSION,
    models: { primary: c.env.MODEL_PRIMARY, secondary: c.env.MODEL_SECONDARY, embeddings: EMBED_MODEL },
    budget: await getBudget(c.env),
    runCostEstimateUsd: RUN_COST_ESTIMATE_USD,
    liveFallbackMs: Number(c.env.LIVE_FALLBACK_MS ?? '') || LIVE_FALLBACK_AFTER_MS,
    typePriors: TYPE_PRIORS,
    themeJoinThreshold: THEME_JOIN_THRESHOLD,
    promotionGate: PROMOTION_GATE,
    minutesSavedPerCall: MINUTES_SAVED_PER_CALL,
    isOwner: c.env.ACCESS.via === 'owner',
  };
}

api.get('/settings', async (c) => ok(c, await settingsView(c)));

const SettingsPatch = z.object({
  thresholds: z.object({ autoRoute: z.number().min(0).max(1), review: z.number().min(0).max(1), grounding: z.number().min(0.5).max(1) }).refine((t) => t.review <= t.autoRoute, 'review threshold must be ≤ autoRoute').optional(),
  liveEnabled: z.boolean().optional(),
  promptVersion: z.enum(['v4', 'v5']).optional(),
});

api.put('/settings', async (c) => {
  if (c.env.ACCESS.via !== 'owner') return fail(c, 403, 'forbidden', 'Only the owner can change settings');
  const b = await body(c, SettingsPatch);
  if (!b.ok) return b.res;
  const before = await settingsView(c);
  if (b.data.thresholds) await putSetting(c.env.DB, 'thresholds', b.data.thresholds);
  if (b.data.promptVersion) await putSetting(c.env.DB, 'prompt_version', b.data.promptVersion);
  if (b.data.liveEnabled !== undefined) await setLive(c.env, b.data.liveEnabled, b.data.liveEnabled ? null : 'disabled_by_owner');
  const after = await settingsView(c);
  await audit(c.env.DB, { workspaceId: null, actor: 'owner', action: 'settings.update', target: 'settings', before: { thresholds: before.thresholds, promptVersion: before.promptVersion, live: before.budget.liveEnabled }, after: { thresholds: after.thresholds, promptVersion: after.promptVersion, live: after.budget.liveEnabled } });
  return ok(c, after);
});

// ------------------------------------------------------------------ workspace & telemetry

api.post('/workspace/reset', async (c) => {
  const ws = c.get('ws');
  if (ws === SEED) return fail(c, 403, 'forbidden', 'The seed workspace cannot be reset');
  const db = c.env.DB;
  const runIds = (await db.prepare('SELECT id FROM runs WHERE workspace_id = ?').bind(ws).all<{ id: string }>()).results.map((r) => r.id);
  const stmts: D1PreparedStatement[] = [
    // Pasted text this workspace uploaded, unless a library file or another workspace's run uses
    // the same bytes (raw_files is content-addressed and shared). Runs first: it reads them.
    db
      .prepare('DELETE FROM raw_files WHERE sha256 IN (SELECT sha256 FROM runs WHERE workspace_id = ?1) AND sha256 NOT IN (SELECT sha256 FROM library_files) AND sha256 NOT IN (SELECT sha256 FROM runs WHERE workspace_id != ?1)')
      .bind(ws),
  ];
  for (let i = 0; i < runIds.length; i += 80) {
    const chunk = runIds.slice(i, i + 80);
    const q = chunk.map(() => '?').join(',');
    for (const t of ['run_steps', 'transcripts', 'redaction_vault']) stmts.push(db.prepare(`DELETE FROM ${t} WHERE run_id IN (${q})`).bind(...chunk));
  }
  for (const t of ['runs', 'insights', 'themes', 'deliveries', 'notifications', 'reviews', 'overlays', 'routing_rules', 'dlq']) stmts.push(db.prepare(`DELETE FROM ${t} WHERE workspace_id = ?`).bind(ws));
  await db.batch(stmts);
  await audit(db, { workspaceId: ws, actor: actorOf(c), action: 'workspace.reset', target: ws, before: { runs: runIds.length } });
  return ok(c, {});
});

api.post('/telemetry', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return fail(c, 400, 'invalid_request', 'Body must be JSON');
  }
  const parsed = TelemetryBatch.safeParse(raw);
  if (!parsed.success) return fail(c, 400, 'invalid_request', issues(parsed.error));
  const ws = c.get('ws');
  const rep = c.get('trace').rep;
  const actorId = `viewer:${ws.replace(/^ws_/, '').slice(0, 6)}`;
  for (const e of parsed.data.events) {
    const at = Number.isFinite(Date.parse(e.at)) ? new Date(e.at).toISOString() : nowIso();
    rep.track({ sessionId: parsed.data.sessionId, actorId, actorRole: 'viewer', kind: e.kind, path: e.path, props: e.props, at, durationMs: e.durationMs });
  }
  return ok(c, { accepted: parsed.data.events.length });
});

api.route('/platform', platformApi); // Agent Ops (src/worker/platform/api.ts)

api.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such endpoint' } }, 404));
api.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', event: 'api.error', msg: String(err).slice(0, 500), path: c.req.path }));
  return c.json({ error: { code: 'internal', message: 'Something went wrong on our side' } }, 500);
});

export type { Insight };
