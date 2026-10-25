/**
 * Agent Ops HTTP API: a Hono sub-app mounted by the gated API at /repo/invoca/api/platform
 * (`api.route('/platform', platformApi)` in src/worker/api/index.ts). Every response is an
 * Envelope `{ data, dataAsOf }`. Reads are side-effect free except the weekly roll-forward
 * of simulated history; writes (assumptions, alert acknowledgements) go to the viewer's own
 * workspace only.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { ApiEnv } from '../env';
import { rollForward } from './store';
import * as R from './reports';

type C = Context<{ Bindings: ApiEnv }>;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}
const WS_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** The viewer's workspace: Signal Loop's `sl_ws` cookie, else Agent Ops' own `ao_ws`. */
function viewerOf(c: C): R.Viewer & { setCookie: string | null } {
  const cookie = c.req.header('cookie');
  // The host API may have minted `sl_ws` on this very request (set-cookie not yet echoed back).
  const minted = c.res?.headers.get('set-cookie')?.match(/(?:^|[;,]\s*)sl_ws=([^;,]+)/)?.[1] ?? null;
  const sl = readCookie(cookie, 'sl_ws') ?? minted;
  const ao = readCookie(cookie, 'ao_ws');
  let workspace = sl && WS_RE.test(sl) ? sl : ao && WS_RE.test(ao) ? ao : null;
  let setCookie: string | null = null;
  if (!workspace) {
    workspace = `ao_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    setCookie = `ao_ws=${workspace}; Path=/repo/invoca; HttpOnly; Secure; SameSite=Lax; Max-Age=${14 * 86_400}`;
  }
  const hints = (c.req.header('x-ao-sessions') ?? c.req.query('you') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9:_-]{4,80}$/.test(s))
    .slice(0, 5);
  return { workspace, sessionHints: hints, setCookie };
}

async function ctxOf(c: C): Promise<R.Ctx & { setCookie: string | null }> {
  const now = new Date();
  const v = viewerOf(c);
  try {
    await rollForward(c.env.PLATFORM_DB, now);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', event: 'platform.roll_forward_failed', msg: String(err) }));
  }
  const limit = Number(c.env.BUDGET_LIMIT_USD ?? 15);
  return { db: c.env.PLATFORM_DB, now, viewer: { workspace: v.workspace, sessionHints: v.sessionHints }, budgetLimitUsd: Number.isFinite(limit) ? limit : 15, setCookie: v.setCookie };
}

function ok<T>(c: C, ctx: { setCookie: string | null; now: Date }, data: T, status: 200 | 201 = 200) {
  if (ctx.setCookie) c.header('set-cookie', ctx.setCookie, { append: true });
  c.header('cache-control', 'no-store');
  return c.json({ data, dataAsOf: ctx.now.toISOString() }, status);
}
function fail(c: C, status: 400 | 404 | 503, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}
const q = (c: C, k: string) => {
  const v = c.req.query(k);
  return v && v.length <= 200 ? v : null;
};

export const platformApi = new Hono<{ Bindings: ApiEnv }>();

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
  return ok(
    c,
    ctx,
    await R.logs(ctx, { agentId: q(c, 'agentId'), level: q(c, 'level'), component: q(c, 'component'), traceId: q(c, 'traceId'), runId: q(c, 'runId'), q: q(c, 'q'), source: q(c, 'source'), cursor: q(c, 'cursor'), limit: Number(q(c, 'limit') ?? 100) || 100 }),
  );
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
  return ok(c, ctx, t);
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
  const body = AssumptionsBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 400, 'invalid', 'loadedHourlyUsd must be a number between 20 and 500, or null to reset');
  return ok(c, ctx, await R.putAssumptions(ctx, body.data.loadedHourlyUsd));
});

const AckBody = z.object({ note: z.string().max(280).nullable().default(null) });
platformApi.post('/alerts/:id/acknowledge', async (c) => {
  const ctx = await ctxOf(c);
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
