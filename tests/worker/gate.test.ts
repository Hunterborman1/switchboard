import { describe, expect, it } from 'vitest';
import { checkAccess, isOwnerToken, linkCookie, ownerCookie, ownerSessionToken, passwordCookie, passwordToken, publicWorkspaceId, safeEqual, safeNext, signLink, signWorkspace, verifyLink, verifyWorkspace } from '../../src/worker/gate.ts';
import { noticeFor, sameOrigin, writeGuard } from '../../src/worker/http.ts';
import { estimateRunCostUsd, RUN_COST_ESTIMATE_USD } from '../../src/shared/scoring.ts';

const SECRET = 'link-secret';
const now = Math.floor(Date.now() / 1000);
const payload = (over = {}) => ({ aud: 'invoca' as const, exp: now + 3600, iat: now, jti: 'j1', ...over });

describe('signed links', () => {
  it('a valid link verifies', async () => {
    const t = await signLink(SECRET, payload());
    const r = await verifyLink(SECRET, t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.jti).toBe('j1');
  });
  it('expired, tampered, wrong audience, wrong secret, malformed and revoked links fail', async () => {
    expect(await verifyLink(SECRET, await signLink(SECRET, payload({ exp: now - 1 })))).toEqual({ ok: false, reason: 'expired' });
    const t = await signLink(SECRET, payload());
    const [body, sig] = t.split('.');
    const forged = btoa(JSON.stringify(payload({ exp: now + 99999 }))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await verifyLink(SECRET, `${forged}.${sig}`)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyLink(SECRET, `${body}.${sig!.slice(0, -2)}xx`)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyLink(SECRET, await signLink(SECRET, { ...payload(), aud: 'other' as 'invoca' }))).toEqual({ ok: false, reason: 'wrong_audience' });
    expect(await verifyLink('other-secret', t)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyLink('', t)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifyLink(SECRET, 'nodot')).toEqual({ ok: false, reason: 'malformed' });
    expect(await verifyLink(SECRET, t, Date.now(), async (jti) => jti === 'j1')).toEqual({ ok: false, reason: 'revoked' });
  });
  it('link cookie Max-Age is capped at exp', () => {
    expect(linkCookie('tok', now + 100, now * 1000)).toMatch(/Max-Age=100$/);
    expect(linkCookie('tok', now - 100, now * 1000)).toMatch(/Max-Age=0$/);
    expect(linkCookie('a.b', now + 1, now * 1000)).toContain('Path=/repo/invoca; HttpOnly; Secure; SameSite=Lax');
  });
});

describe('access decision', () => {
  it('password cookie, link cookie, owner cookie, and nothing', async () => {
    const env = { INVOCA_PASSWORD: 'pw', LINK_SIGNING_SECRET: SECRET, OWNER_TOKEN: 'o'.repeat(40) };
    expect(await checkAccess(`hb_invoca=${await passwordToken('pw')}`, env)).toEqual({ ok: true, via: 'password', linkExpiresAt: null });
    expect(await checkAccess(`hb_invoca=${await passwordToken('wrong')}`, env)).toEqual({ ok: false });
    const t = await signLink(SECRET, payload());
    const link = await checkAccess(`hb_invoca_link=${encodeURIComponent(t)}`, env);
    expect(link).toMatchObject({ ok: true, via: 'link' });
    expect(await checkAccess(`hb_invoca_link=${encodeURIComponent(t)}`, env, async () => true)).toEqual({ ok: false, reason: 'revoked' });
    expect(await checkAccess('', env)).toEqual({ ok: false });
    expect(await checkAccess('hb_auth=not-hex', env)).toEqual({ ok: false });
    expect(await checkAccess(`hb_invoca=${await passwordToken('pw')}`, { ...env, INVOCA_PASSWORD: undefined })).toEqual({ ok: false });
    expect(await passwordCookie('pw')).toMatch(/^hb_invoca=[a-f0-9]{64}; Path=\/repo\/invoca; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
  });
  it('the owner is OWNER_TOKEN only: the shared host cookie (hb_auth / SITE_PASSWORD) grants nothing', async () => {
    const env = { INVOCA_PASSWORD: 'pw', LINK_SIGNING_SECRET: SECRET, OWNER_TOKEN: 'o'.repeat(40) };
    expect(await checkAccess(`hb_invoca_owner=${await ownerSessionToken(env.OWNER_TOKEN)}`, env)).toEqual({ ok: true, via: 'owner', linkExpiresAt: null });
    expect(await checkAccess(`hb_invoca_owner=${await ownerSessionToken('x'.repeat(40))}`, env)).toEqual({ ok: false });
    // The hb-repos derivation of the shared site password: no longer an owner (or any) bypass.
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode('hb-gate|site'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const hbAuth = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('hb-site-auth-v1')))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await checkAccess(`hb_auth=${hbAuth}`, { ...env, SITE_PASSWORD: 'site' } as never)).toEqual({ ok: false });
    // A short or unset OWNER_TOKEN never makes anyone owner.
    expect(await isOwnerToken('short', 'short')).toBe(false);
    expect(await isOwnerToken('', undefined)).toBe(false);
    expect(await isOwnerToken(env.OWNER_TOKEN, env.OWNER_TOKEN)).toBe(true);
    expect(await checkAccess(`hb_invoca_owner=${await ownerSessionToken('short')}`, { ...env, OWNER_TOKEN: 'short' })).toEqual({ ok: false });
    expect(await ownerCookie(env.OWNER_TOKEN)).toMatch(/^hb_invoca_owner=[a-f0-9]{64}; Path=\/repo\/invoca; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
  });
  it('a revocation lookup that fails denies the link (fail closed), with its own reason', async () => {
    const t = await signLink(SECRET, payload());
    expect(await verifyLink(SECRET, t, Date.now(), async () => { throw new Error('D1 down'); })).toEqual({ ok: false, reason: 'unavailable' });
    // The password cookie never consults D1, so it keeps working through the same outage.
    expect(await checkAccess(`hb_invoca=${await passwordToken('pw')}`, { INVOCA_PASSWORD: 'pw', LINK_SIGNING_SECRET: SECRET }, async () => { throw new Error('D1 down'); })).toMatchObject({ ok: true, via: 'password' });
  });
  it('safeEqual is exact', async () => {
    expect(await safeEqual('a', 'a')).toBe(true);
    expect(await safeEqual('a', 'b')).toBe(false);
    expect(await safeEqual('a', 'aa')).toBe(false);
  });
});

describe('signed workspace cookie', () => {
  it('round-trips; rejects unsigned, forged, re-signed-under-another-key and malformed values', async () => {
    const ws = 'ws_0123456789abcdef';
    const v = await signWorkspace(ws, SECRET);
    expect(v).toMatch(/^ws_0123456789abcdef\.[A-Za-z0-9_-]{22}$/);
    expect(await verifyWorkspace(v, SECRET)).toBe(ws);
    expect(await verifyWorkspace(ws, SECRET)).toBeNull(); // legacy unsigned
    expect(await verifyWorkspace(`ws_fedcba9876543210.${v.split('.')[1]}`, SECRET)).toBeNull(); // signature moved to another id
    expect(await verifyWorkspace(await signWorkspace(ws, 'other'), SECRET)).toBeNull();
    expect(await verifyWorkspace(await signWorkspace('seed', SECRET), SECRET)).toBeNull();
    expect(await verifyWorkspace('', SECRET)).toBeNull();
    expect(await verifyWorkspace(null, SECRET)).toBeNull();
  });
  it('public form keeps a short prefix only', () => {
    expect(publicWorkspaceId('ws_0123456789abcdef')).toBe('ws_012345');
    expect(publicWorkspaceId('{"w":"ws_0123456789abcdef","x":"seed"}')).toBe('{"w":"ws_012345","x":"seed"}');
  });
});

describe('request guards', () => {
  const url = new URL('https://repos.hunterborman.com/repo/invoca/api/runs');
  const req = (method: string, headers: Record<string, string>, path = url.href) => new Request(path, { method, headers });
  it('same origin: Sec-Fetch-Site and Origin must match when present', () => {
    expect(sameOrigin(req('POST', {}), url)).toBe(true); // non-browser client
    expect(sameOrigin(req('POST', { 'sec-fetch-site': 'same-origin', origin: 'https://repos.hunterborman.com' }), url)).toBe(true);
    expect(sameOrigin(req('POST', { 'sec-fetch-site': 'cross-site' }), url)).toBe(false);
    expect(sameOrigin(req('POST', { 'sec-fetch-site': 'same-site' }), url)).toBe(false);
    expect(sameOrigin(req('POST', { origin: 'https://evil.example' }), url)).toBe(false);
    expect(sameOrigin(req('POST', { origin: 'null' }), url)).toBe(false);
  });
  it('writes need same origin, a JSON body and x-signal-loop (except the telemetry beacon)', () => {
    const okHeaders = { 'content-type': 'application/json', 'x-signal-loop': '1', 'sec-fetch-site': 'same-origin' };
    expect(writeGuard(req('GET', {}), url)).toBeNull();
    expect(writeGuard(req('POST', okHeaders), url)).toBeNull();
    expect(writeGuard(req('POST', { ...okHeaders, 'sec-fetch-site': 'cross-site' }), url)?.status).toBe(403);
    expect(writeGuard(req('POST', { ...okHeaders, 'content-type': 'application/x-www-form-urlencoded' }), url)?.status).toBe(415);
    expect(writeGuard(req('POST', { ...okHeaders, 'content-type': 'text/plain' }), url)?.status).toBe(415);
    expect(writeGuard(req('PUT', { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }), url)?.status).toBe(403);
    const tel = new URL('https://repos.hunterborman.com/repo/invoca/api/telemetry');
    expect(writeGuard(req('POST', { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, tel.href), tel)).toBeNull();
    expect(writeGuard(req('POST', { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, tel.href), tel)?.status).toBe(403);
  });
  it('login notices are an allowlist of codes', () => {
    expect(noticeFor('expired')).toMatch(/expired/);
    expect(noticeFor('<script>alert(1)</script>')).toBeNull();
    expect(noticeFor('Call 555-0100 to verify your account')).toBeNull();
    expect(noticeFor('toString')).toBeNull();
    expect(noticeFor(null)).toBeNull();
  });
});

describe('run reservation size', () => {
  const models = ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-haiku-5.5'];
  it('grows with input, covers three attempts of every call, and prices unknown models higher', () => {
    const small = estimateRunCostUsd(2_000, models);
    const big = estimateRunCostUsd(60_000, models);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small * 2);
    // 60k chars: 20k tokens × 3 attempts × 2 transcript calls at $0.10/M in, plus max outputs.
    expect(big).toBeGreaterThan((20_000 * 6 * 0.1 + (400 + 2500 + 600) * 3 * 0.5) / 1e6);
    expect(estimateRunCostUsd(60_000, ['unknown/model'])).toBeGreaterThan(big);
    expect(big).toBeLessThan(RUN_COST_ESTIMATE_USD * 3);
  });
});

describe('safeNext', () => {
  it('allows only same-prefix relative paths and strips k', () => {
    expect(safeNext('/repo/invoca/app?x=1&k=abc#h')).toBe('/repo/invoca/app?x=1#h');
    expect(safeNext('https://evil.example/repo/invoca/')).toBe('/repo/invoca/');
    expect(safeNext('//evil.example/repo/invoca/')).toBe('/repo/invoca/');
    expect(safeNext('/repo/invoca\\..\\x')).toBe('/repo/invoca/');
    expect(safeNext('/repo/other/')).toBe('/repo/invoca/');
    expect(safeNext('/repo/invoca/../../etc')).toBe('/repo/invoca/');
    expect(safeNext(null)).toBe('/repo/invoca/');
    expect(safeNext(42)).toBe('/repo/invoca/');
  });
});
