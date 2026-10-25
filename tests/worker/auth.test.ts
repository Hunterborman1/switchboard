import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signLink } from '../../src/worker/gate.ts';
import { API, ORIGIN, SECRETS, startHarness, type Harness } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
}, 180_000);
afterAll(async () => {
  await h?.close();
});

const ROUTES: [string, string][] = [
  ['GET', '/session'], ['GET', '/world'], ['GET', '/library'], ['GET', '/library/file_c1042'], ['POST', '/runs'], ['GET', '/runs'], ['GET', '/runs/run_x'],
  ['GET', '/insights'], ['GET', '/insights/ins_x'], ['GET', '/review'], ['POST', '/review/ins_x'], ['GET', '/themes'], ['GET', '/themes/thm_x'],
  ['GET', '/routing/rules'], ['PUT', '/routing/rules/rule_x'], ['POST', '/routing/preview'], ['GET', '/deliveries'], ['POST', '/deliveries/dlv_x/ticket'],
  ['GET', '/notifications'], ['GET', '/evals'], ['GET', '/health'], ['GET', '/settings'], ['PUT', '/settings'], ['POST', '/workspace/reset'], ['POST', '/telemetry'],
  ['GET', '/ping'], ['GET', '/platform/overview'],
];

describe('every API route requires auth', () => {
  for (const [method, path] of ROUTES) {
    it(`${method} ${path} → 401 without a cookie`, async () => {
      const r = await h.call(path, { method, auth: 'none', ...(method === 'GET' ? {} : { json: {} }) });
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe('unauthorized');
      expect(r.headers.get('set-cookie')).toBeNull(); // no workspace cookie for anonymous callers
    });
  }

  it('a forged password cookie is rejected', async () => {
    const r = await h.server.fetch(`${API}/session`, { headers: { cookie: `hb_invoca=${'0'.repeat(64)}` } });
    expect(r.status).toBe(401);
  });

  it('the password cookie, owner cookie and a signed-link cookie each grant access', async () => {
    expect((await h.call('/session', { auth: 'password' })).status).toBe(200);
    expect((await h.call('/session', { auth: 'owner' })).status).toBe(200);
    const now = Math.floor(Date.now() / 1000);
    const token = await signLink(SECRETS.LINK_SIGNING_SECRET, { aud: 'invoca', exp: now + 3600, iat: now, jti: 'jti-auth-test' });
    const r = await h.server.fetch(`${API}/session`, { headers: { cookie: `hb_invoca_link=${encodeURIComponent(token)}` } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { data: { linkExpiresAt: string } };
    expect(body.data.linkExpiresAt).toBe(new Date((now + 3600) * 1000).toISOString());
  });

  it('a revoked link stops working', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signLink(SECRETS.LINK_SIGNING_SECRET, { aud: 'invoca', exp: now + 3600, iat: now, jti: 'jti-revoked' });
    await h.env.DB.prepare("INSERT OR IGNORE INTO revoked_links (jti, revoked_at) VALUES ('jti-revoked', ?)").bind(new Date().toISOString()).run();
    const r = await h.server.fetch(`${API}/session`, { headers: { cookie: `hb_invoca_link=${encodeURIComponent(token)}` } });
    expect(r.status).toBe(401);
  });
});

describe('gate pages', () => {
  it('unauthenticated SPA requests redirect to login; login page is public', async () => {
    const r = await h.server.fetch(`${ORIGIN}/repo/invoca/app`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toContain('/repo/invoca/login?next=');
    const login = await h.server.fetch(`${ORIGIN}/repo/invoca/login`);
    expect(login.status).toBe(200);
    expect(login.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('unlock with the right password sets the cookie; wrong password is 401', async () => {
    const bad = await h.server.fetch(`${API}/unlock`, { method: 'POST', body: new URLSearchParams({ password: 'nope', next: '/repo/invoca/' }), redirect: 'manual' });
    expect(bad.status).toBe(401);
    const good = await h.server.fetch(`${API}/unlock`, { method: 'POST', body: new URLSearchParams({ password: SECRETS.INVOCA_PASSWORD, next: '/repo/invoca/app' }), redirect: 'manual' });
    expect(good.status).toBe(303);
    expect(good.headers.get('location')).toBe('/repo/invoca/app');
    expect(good.headers.get('set-cookie')).toMatch(/hb_invoca=[a-f0-9]{64}; Path=\/repo\/invoca; HttpOnly; Secure; SameSite=Lax/);
  });

  it('a signed link sets the link cookie and strips k; an expired link goes to login', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signLink(SECRETS.LINK_SIGNING_SECRET, { aud: 'invoca', exp: now + 600, iat: now, jti: 'jti-page' });
    const r = await h.server.fetch(`${ORIGIN}/repo/invoca/?k=${token}&tour=ch1`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/repo/invoca/?tour=ch1');
    expect(r.headers.get('set-cookie')).toContain('hb_invoca_link=');
    const expired = await signLink(SECRETS.LINK_SIGNING_SECRET, { aud: 'invoca', exp: now - 10, iat: now - 100, jti: 'jti-old' });
    const e = await h.server.fetch(`${ORIGIN}/repo/invoca/?k=${expired}`, { redirect: 'manual' });
    expect(e.status).toBe(302);
    expect(e.headers.get('location')).toContain('/repo/invoca/login');
    expect(decodeURIComponent(e.headers.get('location')!)).toContain('expired');
  });

  it('paths outside /repo/invoca are 404', async () => {
    expect((await h.server.fetch(`${ORIGIN}/repo/other`)).status).toBe(404);
  });
});
