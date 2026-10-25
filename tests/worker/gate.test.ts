import { describe, expect, it } from 'vitest';
import { checkAccess, linkCookie, passwordCookie, passwordToken, safeEqual, safeNext, signLink, verifyLink } from '../../src/worker/gate.ts';

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
    const env = { INVOCA_PASSWORD: 'pw', LINK_SIGNING_SECRET: SECRET, SITE_PASSWORD: 'site' };
    expect(await checkAccess(`hb_invoca=${await passwordToken('pw')}`, env)).toEqual({ ok: true, via: 'password', linkExpiresAt: null });
    expect(await checkAccess(`hb_invoca=${await passwordToken('wrong')}`, env)).toEqual({ ok: false });
    const t = await signLink(SECRET, payload());
    const link = await checkAccess(`hb_invoca_link=${encodeURIComponent(t)}`, env);
    expect(link).toMatchObject({ ok: true, via: 'link' });
    expect(await checkAccess(`hb_invoca_link=${encodeURIComponent(t)}`, env, async () => true)).toEqual({ ok: false });
    expect(await checkAccess('', env)).toEqual({ ok: false });
    expect(await checkAccess('hb_auth=not-hex', env)).toEqual({ ok: false });
    expect(await checkAccess(`hb_invoca=${await passwordToken('pw')}`, { ...env, INVOCA_PASSWORD: undefined })).toEqual({ ok: false });
    expect(await passwordCookie('pw')).toMatch(/^hb_invoca=[a-f0-9]{64}; Path=\/repo\/invoca; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
  });
  it('safeEqual is exact', async () => {
    expect(await safeEqual('a', 'a')).toBe(true);
    expect(await safeEqual('a', 'b')).toBe(false);
    expect(await safeEqual('a', 'aa')).toBe(false);
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
