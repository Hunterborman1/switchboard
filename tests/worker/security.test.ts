/**
 * Security and correctness fixes, against the real Worker (createTestHarness): owner access,
 * sign-in rate limit, CSRF / cross-app guard, signed workspaces, Agent Ops redaction, ledger
 * and budget hard stop, single execution, workflow exhaustion, response headers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, newWs, ORIGIN, SECRETS, seedFixtures, signedWs, startHarness, waitForRun, type Harness } from './harness.ts';
import { claimWorkflow } from '../../src/worker/execute.ts';
import { WriteQueue } from '../../src/worker/writeQueue.ts';
import { putAssumptions } from '../../src/worker/platform/reports.ts';
import { SIGNAL_LOOP_AGENT_ID } from '../../src/shared/platform-contracts.ts';
import { MAX_UNSETTLED_RESERVATIONS } from '../../src/shared/scoring.ts';

let h: Harness;
let pdb: D1Database;

beforeAll(async () => {
  h = await startHarness({ vars: { LIVE_FALLBACK_MS: '60000' } });
  await seedFixtures(h.env.DB);
  await h.worker.applyD1Migrations('PLATFORM_DB');
  pdb = ((await h.worker.getEnv()) as { PLATFORM_DB: D1Database }).PLATFORM_DB;
}, 180_000);
afterAll(async () => {
  await h?.close();
});

const ip = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
const raw = (path: string, init: RequestInit = {}) => h.server.fetch(path.startsWith('http') ? path : `${ORIGIN}${path}`, { redirect: 'manual', ...init });

describe('owner access', () => {
  it('the shared host cookie (hb_auth from SITE_PASSWORD) no longer grants anything', async () => {
    const r = await h.call('/session', { auth: 'hb_auth' });
    expect(r.status).toBe(401);
  });

  it('?owner=<OWNER_TOKEN> sets the owner cookie and strips the token; a wrong token goes to sign-in', async () => {
    const good = await raw(`/repo/invoca/app?owner=${encodeURIComponent(SECRETS.OWNER_TOKEN)}&tab=1`, { headers: { 'cf-connecting-ip': ip() } });
    expect(good.status).toBe(302);
    expect(good.headers.get('location')).toBe('/repo/invoca/app?tab=1');
    const cookie = good.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^hb_invoca_owner=[a-f0-9]{64}; Path=\/repo\/invoca; HttpOnly; Secure; SameSite=Lax/);
    const session = await raw(`${API}/session`, { headers: { cookie: cookie.split(';')[0]! } });
    expect(((await session.json()) as { data: { isOwner: boolean } }).data.isOwner).toBe(true);
    const bad = await raw('/repo/invoca/app?owner=not-the-token', { headers: { 'cf-connecting-ip': ip() } });
    expect(bad.status).toBe(302);
    expect(bad.headers.get('location')).toContain('/repo/invoca/login?next=%2Frepo%2Finvoca%2Fapp&notice=invalid');
    expect(bad.headers.get('set-cookie')).toBeNull();
  });

  it('settings: owner can write, password viewers cannot; the password still works for everyone', async () => {
    const ws = newWs();
    expect((await h.call('/session', { ws })).status).toBe(200);
    expect((await h.call('/settings', { method: 'PUT', ws, json: { promptVersion: 'v4' } })).status).toBe(403);
    expect((await h.call('/settings', { method: 'PUT', ws, auth: 'owner', json: { promptVersion: 'v4' } })).status).toBe(200);
  });
});

describe('sign-in', () => {
  it('rate limits password attempts per IP (429, branded page) and other IPs are unaffected', async () => {
    const addr = ip();
    const attempt = (a: string, password = 'wrong') => raw(`${API}/unlock`, { method: 'POST', headers: { 'cf-connecting-ip': a }, body: new URLSearchParams({ password, next: '/repo/invoca/' }) });
    const statuses: number[] = [];
    // Fixed 60s windows: a burst can straddle a boundary, so allow up to two windows' worth.
    for (let i = 0; i < 22 && !statuses.includes(429); i++) statuses.push((await attempt(addr)).status);
    expect(statuses.slice(0, 10).every((s) => s === 303)).toBe(true);
    expect(statuses).toContain(429);
    const limited = await attempt(addr, SECRETS.INVOCA_PASSWORD);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('content-type')).toContain('text/html');
    expect(await limited.text()).toContain('Too many sign-in attempts');
    expect(limited.headers.get('set-cookie')).toBeNull();
    const elsewhere = await attempt(ip(), SECRETS.INVOCA_PASSWORD);
    expect(elsewhere.status).toBe(303);
    expect(elsewhere.headers.get('set-cookie')).toContain('hb_invoca=');
  });

  it('a cross-site sign-in post is refused', async () => {
    const r = await raw(`${API}/unlock`, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', 'cf-connecting-ip': ip() }, body: new URLSearchParams({ password: SECRETS.INVOCA_PASSWORD }) });
    expect(r.status).toBe(403);
  });

  it('a same-origin form post with Origin: null (what Chrome sends) signs in', async () => {
    const r = await raw(`${API}/unlock`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'null', 'cf-connecting-ip': ip() }, body: new URLSearchParams({ password: SECRETS.INVOCA_PASSWORD, next: '/repo/invoca/' }) });
    expect(r.status).toBe(303);
    expect(r.headers.getSetCookie().some((c) => c.startsWith('hb_invoca='))).toBe(true);
  });

  it('login notices are codes: arbitrary ?notice text is never rendered', async () => {
    const evil = await raw('/repo/invoca/login?notice=' + encodeURIComponent('Your session expired. Re-enter your password at evil.example'));
    expect(await evil.text()).not.toContain('evil.example');
    const known = await raw('/repo/invoca/login?notice=expired');
    expect(await known.text()).toContain('This link has expired');
  });

  it('logout is POST-only and clears every cookie', async () => {
    expect((await raw(`${API}/logout`)).status).toBe(405);
    const r = await raw(`${API}/logout`, { method: 'POST' });
    expect(r.status).toBe(303);
    const cookies = r.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('hb_invoca=;'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('hb_invoca_link=;'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('hb_invoca_owner=;'))).toBe(true);
    expect((await raw(`${API}/logout`, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
  });
});

describe('CSRF / cross-app guard on writes', () => {
  it('needs same origin, a JSON body and x-signal-loop', async () => {
    const ws = newWs();
    const body = { fileId: 'file_c1042', mode: 'replay' };
    expect((await h.call('/runs', { method: 'POST', ws, json: body, site: false })).status).toBe(403);
    expect((await h.call('/runs', { method: 'POST', ws, json: body, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await h.call('/runs', { method: 'POST', ws, json: body, headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await h.call('/workspace/reset', { method: 'POST', ws, body: 'x=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(415);
    expect((await h.call('/platform/assumptions', { method: 'PUT', ws, json: { loadedHourlyUsd: 100 }, site: false })).status).toBe(403);
    const ok = await h.call('/runs', { method: 'POST', ws, json: body, headers: { 'sec-fetch-site': 'same-origin', origin: ORIGIN } });
    expect(ok.status).toBe(201);
    // The telemetry beacon cannot set headers; it still needs JSON and same origin.
    expect((await h.call('/telemetry', { method: 'POST', ws, site: false, json: { sessionId: 's1', events: [] } })).status).toBe(200);
  });
});

describe('workspaces', () => {
  it('a forged or legacy sl_ws never reaches another workspace', async () => {
    const victim = newWs();
    const r = await h.call('/runs', { method: 'POST', ws: victim, json: { fileId: 'file_c1042', mode: 'replay' } });
    const runId = r.json.data.runId;
    expect((await h.call(`/runs/${runId}`, { ws: victim })).status).toBe(200);
    expect((await h.call(`/runs/${runId}`, { rawWs: victim })).status).toBe(404); // unsigned legacy value
    const forged = `${victim}.${(await signedWs(newWs())).split('.')[1]}`;
    const f = await h.call(`/runs/${runId}`, { rawWs: forged });
    expect(f.status).toBe(404);
    expect(f.headers.get('set-cookie')).toMatch(/sl_ws=ws_[a-f0-9]{16}\./);
  });

  it('reset deletes the workspace\'s raw files and vault, keeping bytes another workspace or the library uses', async () => {
    const ws = newWs();
    const other = newWs();
    const now = new Date().toISOString();
    const db = h.env.DB;
    const run = (id: string, w: string, sha: string) =>
      db.prepare("INSERT INTO runs (id, workspace_id, filename, status, mode, sha256, created_at, prompt_version) VALUES (?, ?, 'p.txt', 'completed', 'live', ?, ?, 'v4')").bind(id, w, sha, now);
    const rawFile = (sha: string) => db.prepare("INSERT OR IGNORE INTO raw_files (sha256, filename, size_bytes, content, created_at) VALUES (?, 'p.txt', 4, 'text', ?)").bind(sha, now);
    await db.batch([
      rawFile('sha_mine_only'), rawFile('sha_shared'), run('run_reset_a', ws, 'sha_mine_only'), run('run_reset_b', ws, 'sha_shared'), run('run_reset_c', other, 'sha_shared'),
      db.prepare("INSERT INTO redaction_vault (run_id, vault, created_at) VALUES ('run_reset_a', '{\"[NAME_1]\":\"Jane\"}', ?)").bind(now),
    ]);
    expect((await h.call('/workspace/reset', { method: 'POST', ws, json: {} })).status).toBe(200);
    const has = async (sql: string, v: string) => !!(await db.prepare(sql).bind(v).first());
    expect(await has('SELECT 1 FROM raw_files WHERE sha256 = ?', 'sha_mine_only')).toBe(false);
    expect(await has('SELECT 1 FROM raw_files WHERE sha256 = ?', 'sha_shared')).toBe(true);
    expect(await has('SELECT 1 FROM redaction_vault WHERE run_id = ?', 'run_reset_a')).toBe(false);
    expect(await has('SELECT 1 FROM runs WHERE id = ?', 'run_reset_c')).toBe(true);
    const lib = await db.prepare('SELECT sha256 FROM library_files LIMIT 1').first<{ sha256: string }>();
    expect(await has('SELECT 1 FROM raw_files WHERE sha256 = ?', lib!.sha256)).toBe(true);
  });

  it('a malformed runs cursor is a 400, not a 500', async () => {
    const ws = newWs();
    expect((await h.call('/runs?cursor=%%%', { ws })).status).toBe(400);
    expect((await h.call(`/runs?cursor=${btoa('not-a-date|run_x')}`, { ws })).status).toBe(400);
    expect((await h.call(`/runs?cursor=${btoa(`${new Date().toISOString()}|run_x`).replace(/=+$/, '')}`, { ws })).status).toBe(200);
  });
});

describe('Agent Ops privacy between viewers', () => {
  const a = newWs();
  const b = newWs();
  const traceId = 'feedbeef'.repeat(4);
  beforeAll(async () => {
    const now = new Date().toISOString();
    await h.call('/session', { ws: a });
    const mk = (id: string, event: string, message: string, fields: Record<string, unknown>) => ({ id, agentId: SIGNAL_LOOP_AGENT_ID, source: 'live', at: now, level: 'info', component: 'workflow', event, message, traceId, spanId: 's1', runId: 'run_priv_1', workspaceId: a, durationMs: 5, fields });
    const { ingestInto } = await import('../../src/worker/platform/ingest.ts');
    const r = await ingestInto(pdb, {
      agentId: SIGNAL_LOOP_AGENT_ID,
      events: [{ id: 'evt_priv_1', agentId: SIGNAL_LOOP_AGENT_ID, source: 'live', sessionId: a, actorId: `viewer:${a.slice(3, 9)}`, actorRole: 'viewer', kind: 'run_created', path: null, props: { runId: 'run_priv_1' }, at: now, durationMs: null }],
      logs: [
        mk('log_priv_1', 'step.finished', 'step screen warned: Injection suspected: "SECRET EXCERPT from the transcript"', { step: 'screen', status: 'warned', excerpt: 'SECRET EXCERPT' }),
        mk('log_priv_2', 'run.duplicate', 'duplicate upload of SECRET-FILENAME.txt; returning run_x', { sha256: 'abc' }),
      ],
      spans: [{ traceId, spanId: 's1', parentId: null, agentId: SIGNAL_LOOP_AGENT_ID, name: 'step.screen', start: now, durationMs: 5, status: 'error', attrs: { error: 'SECRET EXCERPT', workspace: a, costUsd: 0.001 } }],
      work: [],
    });
    expect(r.ok).toBe(true);
  });

  it('another viewer sees redacted messages and short workspace ids; the owner of the run sees it all', async () => {
    const theirs = await h.call(`/platform/logs?runId=run_priv_1`, { ws: b });
    expect(theirs.status).toBe(200);
    const text = JSON.stringify(theirs.json.data);
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain(a);
    expect(theirs.json.data.rows.find((l: any) => l.event === 'step.finished').message).toBe('step screen warned');
    expect(theirs.json.data.rows[0].workspaceId).toBe(a.slice(0, 9));
    const mine = await h.call(`/platform/logs?runId=run_priv_1`, { ws: a });
    expect(JSON.stringify(mine.json.data)).toContain('SECRET EXCERPT');
    expect(JSON.stringify(mine.json.data)).not.toContain(a); // even your own id is shortened
  });

  it('message search cannot probe another viewer\'s text', async () => {
    expect((await h.call(`/platform/logs?q=${encodeURIComponent('SECRET EXCERPT')}`, { ws: b })).json.data.rows).toHaveLength(0);
    expect((await h.call(`/platform/logs?q=${encodeURIComponent('SECRET EXCERPT')}`, { ws: a })).json.data.rows.length).toBeGreaterThan(0);
  });

  it('traces of another viewer are redacted (logs and span attributes); usage hides full ids', async () => {
    const t = await h.call(`/platform/traces/${traceId}`, { ws: b });
    expect(t.status).toBe(200);
    expect(JSON.stringify(t.json.data)).not.toContain('SECRET');
    expect(t.json.data.spans[0].attrs.costUsd).toBe(0.001);
    expect(JSON.stringify((await h.call(`/platform/traces/${traceId}`, { ws: a })).json.data)).toContain('SECRET EXCERPT');
    const u = await h.call('/platform/usage', { ws: b });
    expect(JSON.stringify(u.json.data)).not.toContain(a);
  });

  it('a bad log cursor is a 400; viewer writes reject the seed workspace', async () => {
    expect((await h.call('/platform/logs?cursor=garbage', { ws: b })).status).toBe(400);
    const ctx = { db: pdb, now: new Date(), viewer: { workspace: 'seed', sessionHints: [] }, budgetLimitUsd: 15 };
    await expect(putAssumptions(ctx, 100)).rejects.toThrow(/viewer workspace/);
    await expect(putAssumptions({ ...ctx, viewer: { workspace: 'ao_abc', sessionHints: [] } }, 100)).rejects.toThrow(/viewer workspace/);
  });
});

describe('ledger, budget and execution', () => {
  it('the write queue commits nothing for a run that is no longer live (guard in the same transaction)', async () => {
    const db = h.env.DB;
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO runs (id, workspace_id, filename, status, mode, sha256, created_at, prompt_version) VALUES ('run_q_live', 'ws_q', 'f', 'running', 'live', 's', ?, 'v4')").bind(now),
      db.prepare("INSERT INTO runs (id, workspace_id, filename, status, mode, sha256, created_at, prompt_version) VALUES ('run_q_replay', 'ws_q', 'f', 'running', 'replay', 's', ?, 'v4')").bind(now),
    ]);
    const live = new WriteQueue(db, 'run_q_live', { guardLive: true });
    live.push(db.prepare("UPDATE runs SET error = 'written' WHERE id = 'run_q_live'"));
    await live.drain();
    expect(live.superseded).toBe(false);
    const gone = new WriteQueue(db, 'run_q_replay', { guardLive: true });
    gone.push(db.prepare("UPDATE runs SET error = 'written' WHERE id = 'run_q_replay'"));
    await gone.drain();
    expect(gone.superseded).toBe(true);
    const rows = (await db.prepare("SELECT id, error FROM runs WHERE id IN ('run_q_live', 'run_q_replay') ORDER BY id").all<{ id: string; error: string | null }>()).results;
    expect(rows).toEqual([{ id: 'run_q_live', error: 'written' }, { id: 'run_q_replay', error: null }]);
  });

  it('a workflow is claimed once: the second claimant (handoff vs stalled recovery) loses', async () => {
    const db = h.env.DB;
    await db.prepare("INSERT INTO runs (id, workspace_id, filename, status, mode, sha256, created_at, prompt_version) VALUES ('run_claim', 'ws_q', 'f', 'running', 'live', 's', ?, 'v4')").bind(new Date().toISOString()).run();
    const env = { DB: db } as never;
    expect(await claimWorkflow(env, 'run_claim', 'run_claim')).toBe(true);
    expect(await claimWorkflow(env, 'run_claim', 'run_claim-r')).toBe(false);
    expect((await db.prepare("SELECT workflow_id FROM runs WHERE id = 'run_claim'").first<{ workflow_id: string }>())!.workflow_id).toBe('run_claim');
  });

  it('caps concurrent unsettled reservations: library files replay (live_busy), pasted text gets 429', async () => {
    const db = h.env.DB;
    const now = Date.now();
    const ids = Array.from({ length: MAX_UNSETTLED_RESERVATIONS }, (_, i) => `run_busy_${i}`);
    await db.batch(ids.map((id) => db.prepare('INSERT INTO budget_reservations (run_id, est_usd, created_ms, settled) VALUES (?, 0.001, ?, 0)').bind(id, now)));
    try {
      const ws = newWs();
      const file = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_meridian_phi' } });
      expect(file.json.data).toMatchObject({ mode: 'replay', modeReason: 'live_busy' });
      const text = await h.call('/runs', { method: 'POST', ws, json: { text: 'A pasted note about offline conversions lagging in Google Ads, never seen before.' } });
      expect(text.status).toBe(429);
      expect(text.json.error.code).toBe('live_busy');
    } finally {
      await db.prepare(`DELETE FROM budget_reservations WHERE run_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
    }
  });

  it('a live run reserves a size-based estimate and settles it; a provider 402 turns live AI off', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { text: 'Customer: our dashboard export has been broken since Tuesday OUT_OF_CREDIT. CSM: noted, escalating.' } });
    expect(r.status).toBe(201);
    const res = await h.env.DB.prepare('SELECT est_usd FROM budget_reservations WHERE run_id = ?').bind(r.json.data.runId).first<{ est_usd: number }>();
    expect(res!.est_usd).toBeGreaterThan(0);
    expect(res!.est_usd).not.toBe(0.02);
    await waitForRun(h, r.json.data.runId, ws, (d) => !['queued', 'running'].includes(d.run.status), 45_000).catch(() => null);
    try {
      let enabled = true;
      for (let i = 0; i < 40 && enabled; i++) {
        enabled = (await h.call('/session', { ws })).json.data.budget.liveEnabled;
        if (enabled) await new Promise((x) => setTimeout(x, 250));
      }
      expect(enabled).toBe(false);
      const calls = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM ai_calls WHERE run_id = ?').bind(r.json.data.runId).first<{ n: number }>();
      expect(calls!.n).toBeGreaterThan(0);
    } finally {
      await h.env.DB.prepare("UPDATE settings SET value = 'true' WHERE key = 'live_enabled'").run();
      await h.env.KV.put('live_enabled', 'true');
    }
  }, 60_000);

  it('per-workspace run limit returns 429 once exceeded', async () => {
    const ws = newWs();
    const headers = { 'cf-connecting-ip': ip() };
    const statuses: number[] = [];
    // Fixed 60s windows: a burst can straddle a boundary, so allow up to two windows' worth.
    for (let i = 0; i < 26 && !statuses.includes(429); i++) statuses.push((await h.call('/runs', { method: 'POST', ws, headers, json: { fileId: 'file_c1042', mode: 'replay' } })).status);
    expect(statuses.slice(0, 12).every((s) => s === 200 || s === 201)).toBe(true);
    expect(statuses).toContain(429);
  }, 60_000);
});

describe('responses', () => {
  it('carry CSP, HSTS, nosniff and referrer policy', async () => {
    for (const r of [await raw('/repo/invoca/login'), await raw(`${API}/session`)]) {
      expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(r.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('referrer-policy')).toBe('same-origin');
    }
  });

  it('a revalidated asset (If-None-Match → 304) passes through; hashed assets are forced immutable', async () => {
    const cookie = `hb_invoca=${h.pw}`;
    const shell = await raw('/repo/invoca/', { headers: { cookie } });
    expect(shell.status).toBe(200);
    expect(shell.headers.get('cache-control')).toBe('no-store');
    const src = (await shell.text()).match(/src="(\/repo\/invoca\/assets\/[^"]+\.js)"/)![1]!;
    const first = await raw(src, { headers: { cookie } });
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await raw(src, { headers: { cookie, 'if-none-match': etag! } });
    expect(again.status).toBe(304); // the asset server's revalidation hit (was turned into a 404)
    expect(again.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    // The shell itself, revalidated, is never turned into a 404 either.
    const shellTag = shell.headers.get('etag');
    if (shellTag) expect([200, 304]).toContain((await raw('/repo/invoca/', { headers: { cookie, 'if-none-match': shellTag } })).status);
    const font = await raw('/repo/invoca/public/mark.svg');
    const fontTag = font.headers.get('etag');
    if (fontTag) expect([200, 304]).toContain((await raw('/repo/invoca/public/mark.svg', { headers: { 'if-none-match': fontTag } })).status);
  });

  it('a missing public file is a 404, never the SPA shell', async () => {
    const miss = await raw('/repo/invoca/public/does-not-exist.svg');
    expect(miss.status).toBe(404);
    expect(miss.headers.get('content-type') ?? '').not.toContain('text/html');
    expect((await raw('/repo/invoca/public/mark.svg')).status).toBe(200);
  });
});
