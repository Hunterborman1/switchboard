/**
 * Agent Ops HTTP API: a Hono sub-app mounted by the gated API at /repo/invoca/api/platform
 * (`api.route('/platform', platformApi)` in src/worker/api/index.ts). Every response is an
 * Envelope `{ data, dataAsOf }`. Reads are side-effect free except the weekly roll-forward
 * of simulated history; writes (assumptions, alert acknowledgements) go to the viewer's own
 * workspace only.
 *
 * Privacy between viewers (every viewer shares one password):
 *   - the viewer's workspace is the host API's verified, signed `sl_ws` (c.get('ws')), never
 *     a cookie value read here;
 *   - workspace ids never leave this API in full (publicWorkspaceId: `ws_` + 6 hex);
 *   - another viewer's live logs and spans are redacted: messages are rebuilt from the event
 *     and safe fields, so no transcript excerpt, filename or model error text crosses over.
 *     The viewer's own runs and the simulated history are shown in full.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { ApiEnv } from '../env';
import { publicWorkspaceId, WS_RE } from '../gate';
import { rollForward } from './store';
import * as R from './reports';

type Vars = { ws: string };
type C = Context<{ Bindings: ApiEnv; Variables: Vars }>;

/** The viewer: the signed workspace from the host API, plus "that's you" telemetry hints. */
function viewerOf(c: C): R.Viewer {
  const ws = c.get('ws');
  const hints = (c.req.header('x-ao-sessions') ?? c.req.query('you') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9:_-]{4,80}$/.test(s))
    .slice(0, 5);
  return { workspace: ws && WS_RE.test(ws) ? ws : null, sessionHints: hints };
}

async function ctxOf(c: C): Promise<R.Ctx> {
  const now = new Date();
  try {
    await rollForward(c.env.PLATFORM_DB, now);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'platform.roll_forward_failed', msg: String(err) }));
  }
  const limit = Number(c.env.BUDGET_LIMIT_USD ?? 15);
  return { db: c.env.PLATFORM_DB, now, viewer: viewerOf(c), budgetLimitUsd: Number.isFinite(limit) ? limit : 15 };
}

// ---------------------------------------------------------------- redaction

const SAFE_FIELD_KEYS = new Set(['step', 'status', 'model', 'purpose', 'route', 'channel', 'mode', 'modeReason', 'reason', 'at', 'executor', 'level', 'handoffAt', 'handoffReason', 'via', 'allowed']);

function safeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && SAFE_FIELD_KEYS.has(k) && v.length <= 80) out[k] = v;
  }
  return out;
}

/** A message for another viewer's log line: built from the event and safe fields only. */
export function foreignMessage(l: { event: string; message: string; fields: Record<string, unknown> }): string {
  const f = l.fields ?? {};
  const s = (k: string) => (typeof f[k] === 'string' ? String(f[k]) : '');
  switch (l.event) {
    case 'http.request':
      return l.message; // "<METHOD> <route> → <status> (<ms>ms)": route patterns, no content
    case 'step.started':
      return `step ${s('step')} started`;
    case 'step.finished':
      return `step ${s('step')} ${s('status')}`.trim();
    case 'ai.call':
      return `${s('purpose') || 'model call'} via ${s('model') || 'model'}${f.ok === false ? ' failed' : ''}`;
    case 'run.duplicate':
      return 'duplicate upload; returned the existing run';
    case 'grounding.checked':
      return `${Number(f.passed ?? 0)} of ${Number(f.total ?? 0)} quotes grounded`;
    case 'run.finished':
      return `run ${s('status')}${s('executor') ? ` via ${s('executor').replace('_', ' ')}` : ''}`;
    default:
      return `${l.event} (details are visible only to the viewer who ran it)`;
  }
}

type LogLike = { source: string; workspaceId: string | null; event: string; message: string; fields: Record<string, unknown> };

function isForeign(ws: string | null, workspaceId: string | null | undefined): boolean {
  return !!workspaceId && workspaceId !== 'seed' && workspaceId !== ws;
}

function redactLog<T extends LogLike>(l: T, ws: string | null): T {
  if (l.source !== 'live' || !isForeign(ws, l.workspaceId)) return l;
  return { ...l, message: foreignMessage(l), fields: safeFields(l.fields) };
}

type SpanLike = { attrs: Record<string, unknown> };
function redactSpan<T extends SpanLike>(s: T): T {
  return { ...s, attrs: safeFields(s.attrs) };
}

/** Replace every full workspace id in the response with its public short form. */
function shortenIds<T>(data: T): T {
  return JSON.parse(publicWorkspaceId(JSON.stringify(data))) as T;
}

function ok<T>(c: C, ctx: { now: Date }, data: T, status: 200 | 201 = 200) {
  c.header('cache-control', 'no-store');
  return c.json({ data: shortenIds(data), dataAsOf: ctx.now.toISOString() }, status);
}
function fail(c: C, status: 400 | 403 | 404 | 503, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}
const q = (c: C, k: string) => {
  const v = c.req.query(k);
  return v && v.length <= 200 ? v : null;
};

/** `at|id` log cursor (as returned in nextCursor). */
export function validLogCursor(cursor: string): boolean {
  const [at, id, extra] = cursor.split('|');
  return extra === undefined && !!at && !!id && Number.isFinite(Date.parse(at)) && /^[A-Za-z0-9:_.-]{1,80}$/.test(id);
}

export const platformApi = new Hono<{ Bindings: ApiEnv; Variables: Vars }>();

platformApi.use('*', async (c, next) => {
  if (!c.env.PLATFORM_DB) return fail(c, 503, 'platform_unavailable', 'Agent Ops database is not bound');
  await next();
});

platformApi.get('/meta', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.platformMeta(ctx));
});
platformApi.get('/overview', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.overview(ctx));
});
platformApi.get('/agents', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.registry(ctx));
});
platformApi.get('/agents/:id', async (c) => {
  const ctx = await ctxOf(c);
  const d = await R.agentDetail(ctx, c.req.param('id'));
  if (!d) return fail(c, 404, 'not_found', 'No agent with that id in the registry');
  return ok(c, ctx, d);
});
platformApi.get('/usage', async (c) => {
  const ctx = await ctxOf(c);
  const src = q(c, 'source');
  return ok(c, ctx, await R.usage(ctx, q(c, 'agentId'), src === 'live' || src === 'simulated' ? src : 'all'));
});
platformApi.get('/logs', async (c) => {
  const ctx = await ctxOf(c);
  const cursor = q(c, 'cursor');
  if (cursor && !validLogCursor(cursor)) return fail(c, 400, 'invalid_cursor', 'The cursor is not valid; start from the first page');
  const page = await R.logs(ctx, { agentId: q(c, 'agentId'), level: q(c, 'level'), component: q(c, 'component'), traceId: q(c, 'traceId'), runId: q(c, 'runId'), q: q(c, 'q'), source: q(c, 'source'), cursor, limit: Number(q(c, 'limit') ?? 100) || 100 });
  return ok(c, ctx, { ...page, rows: page.rows.map((l) => redactLog(l, ctx.viewer.workspace)) });
});
platformApi.get('/logs/your-last-run', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.yourLastRun(ctx));
});
platformApi.get('/traces/:traceId', async (c) => {
  const ctx = await ctxOf(c);
  const id = c.req.param('traceId');
  if (!/^[A-Za-z0-9:_-]{4,80}$/.test(id)) return fail(c, 400, 'bad_trace_id', 'Trace ids are 4–80 characters of [A-Za-z0-9:_-]');
  const t = await R.trace(ctx, id);
  if (!t.spans.length && !t.logs.length) return fail(c, 404, 'not_found', 'No spans or logs for that trace id');
  const ws = ctx.viewer.workspace;
  const foreign =
    t.source === 'live' &&
    (t.logs.some((l) => l.source === 'live' && isForeign(ws, l.workspaceId)) || t.spans.some((s) => typeof s.attrs.workspace === 'string' && isForeign(ws, s.attrs.workspace as string)));
  return ok(c, ctx, foreign ? { ...t, logs: t.logs.map((l) => redactLog(l, ws)), spans: t.spans.map(redactSpan) } : t);
});
platformApi.get('/observability', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.observability(ctx, q(c, 'agentId'), q(c, 'range') === '6w' ? '6w' : '7d'));
});
platformApi.get('/cost', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.cost(ctx));
});
platformApi.get('/standard', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.standard(ctx));
});
platformApi.get('/reviews', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.reviews(ctx));
});
platformApi.get('/changelog', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.changelog(ctx, q(c, 'agentId')));
});
platformApi.get('/assumptions', async (c) => {
  const ctx = await ctxOf(c);
  return ok(c, ctx, await R.getAssumptions(ctx));
});

const AssumptionsBody = z.object({ loadedHourlyUsd: z.number().min(20).max(500).nullable() });
platformApi.put('/assumptions', async (c) => {
  const ctx = await ctxOf(c);
  if (!ctx.viewer.workspace) return fail(c, 403, 'forbidden', 'No viewer workspace for this session');
  const body = AssumptionsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 400, 'invalid', 'loadedHourlyUsd must be a number between 20 and 500, or null to reset');
  return ok(c, ctx, await R.putAssumptions(ctx, body.data.loadedHourlyUsd));
});

const AckBody = z.object({ note: z.string().max(280).nullable().default(null) });
platformApi.post('/alerts/:id/acknowledge', async (c) => {
  const ctx = await ctxOf(c);
  if (!ctx.viewer.workspace) return fail(c, 403, 'forbidden', 'No viewer workspace for this session');
  const body = AckBody.safeParse((await c.req.json().catch(() => ({}))) ?? {});
  if (!body.success) return fail(c, 400, 'invalid', 'note must be at most 280 characters');
  await R.acknowledgeAlert(ctx, c.req.param('id'), body.data.note);
  return ok(c, ctx, { id: c.req.param('id'), status: 'acknowledged' as const });
});

platformApi.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such Agent Ops endpoint' } }, 404));
platformApi.onError((err, c) => {
  console.error(JSON.stringify({ level: 'error', event: 'platform.api_error', msg: String(err), path: c.req.path }));
  return c.json({ error: { code: 'internal', message: 'Agent Ops could not build that report' } }, 500);
});
