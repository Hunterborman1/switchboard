/**
 * Access for /repo/invoca: its own password, a 7-day signed link, and an owner bypass.
 *
 *   password   INVOCA_PASSWORD → `hb_invoca` cookie (HMAC of a fixed context under the
 *              password; rotating the password logs every session out).
 *   signed     ?k=<b64url(payload)>.<b64url(hmac)> with payload {aud:"invoca",exp,jti},
 *   link       HMAC-SHA256 under LINK_SIGNING_SECRET. A valid link sets `hb_invoca_link`
 *              (the token itself, Max-Age capped at exp) and redirects with `k` stripped.
 *              Revoke one link by adding its jti to D1 `revoked_links`; revoke all by
 *              rotating the secret. The password keeps working either way.
 *   owner      the shared `hb_auth` cookie from repos.hunterborman.com (same derivation as
 *              hb-repos/worker/gate.ts) also unlocks, and marks the session as owner.
 */

export const PREFIX = '/repo/invoca';
const PW_COOKIE = 'hb_invoca';
const LINK_COOKIE = 'hb_invoca_link';
const PW_MAX_AGE = 14 * 24 * 3600;

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(keyMaterial: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(message));
}

/** Constant-time string compare (hash both sides so lengths match). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}

function readCookie(header: string, name: string): string | null {
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

// ------------------------------------------------------------------ password

export async function passwordToken(password: string): Promise<string> {
  return hex(await hmac(`invoca-gate|${password}`, 'signal-loop-auth-v1'));
}

export async function passwordCookie(password: string): Promise<string> {
  return `${PW_COOKIE}=${await passwordToken(password)}; Path=${PREFIX}; HttpOnly; Secure; SameSite=Lax; Max-Age=${PW_MAX_AGE}`;
}

// ------------------------------------------------------------------ signed link

export type LinkPayload = { aud: 'invoca'; exp: number; jti: string; iat: number };

export async function signLink(secret: string, payload: LinkPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(new Uint8Array(await hmac(secret, `invoca-link-v1.${body}`)));
  return `${body}.${sig}`;
}

export type LinkCheck = { ok: true; payload: LinkPayload } | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_audience' | 'revoked' };

export async function verifyLink(secret: string, token: string, now = Date.now(), isRevoked?: (jti: string) => Promise<boolean>): Promise<LinkCheck> {
  if (!secret) return { ok: false, reason: 'bad_signature' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const expected = b64url(new Uint8Array(await hmac(secret, `invoca-link-v1.${parts[0]}`)));
  if (!(await safeEqual(expected, parts[1]))) return { ok: false, reason: 'bad_signature' };
  let payload: LinkPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.aud !== 'invoca') return { ok: false, reason: 'wrong_audience' };
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return { ok: false, reason: 'expired' };
  if (isRevoked && (await isRevoked(payload.jti))) return { ok: false, reason: 'revoked' };
  return { ok: true, payload };
}

export function linkCookie(token: string, exp: number, now = Date.now()): string {
  const maxAge = Math.max(0, Math.floor(exp - now / 1000));
  return `${LINK_COOKIE}=${encodeURIComponent(token)}; Path=${PREFIX}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ------------------------------------------------------------------ owner (shared host cookie)

async function ownerToken(sitePassword: string): Promise<string> {
  return hex(await hmac(`hb-gate|${sitePassword}`, 'hb-site-auth-v1'));
}

// ------------------------------------------------------------------ the decision

export type GateEnv = { INVOCA_PASSWORD?: string; LINK_SIGNING_SECRET?: string; SITE_PASSWORD?: string };
export type Access = { ok: false } | { ok: true; via: 'password' | 'link' | 'owner'; linkExpiresAt: string | null };

export async function checkAccess(cookieHeader: string, env: GateEnv, isRevoked?: (jti: string) => Promise<boolean>): Promise<Access> {
  const owner = readCookie(cookieHeader, 'hb_auth');
  if (owner && env.SITE_PASSWORD && /^[a-f0-9]{64}$/.test(owner) && (await safeEqual(owner, await ownerToken(env.SITE_PASSWORD)))) {
    return { ok: true, via: 'owner', linkExpiresAt: null };
  }
  const pw = readCookie(cookieHeader, PW_COOKIE);
  if (pw && env.INVOCA_PASSWORD && (await safeEqual(pw, await passwordToken(env.INVOCA_PASSWORD)))) {
    return { ok: true, via: 'password', linkExpiresAt: null };
  }
  const link = readCookie(cookieHeader, LINK_COOKIE);
  if (link && env.LINK_SIGNING_SECRET) {
    const r = await verifyLink(env.LINK_SIGNING_SECRET, link, Date.now(), isRevoked);
    if (r.ok) return { ok: true, via: 'link', linkExpiresAt: new Date(r.payload.exp * 1000).toISOString() };
  }
  return { ok: false };
}

export function clearCookies(): string[] {
  return [PW_COOKIE, LINK_COOKIE].map((n) => `${n}=; Path=${PREFIX}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

/** Only same-prefix relative paths are allowed as post-login destinations. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith(`${PREFIX}/`) || value.startsWith('//') || value.includes('\\')) return `${PREFIX}/`;
  try {
    const u = new URL(value, 'https://repos.hunterborman.com');
    if (u.host !== 'repos.hunterborman.com' || !u.pathname.startsWith(`${PREFIX}/`)) return `${PREFIX}/`;
    u.searchParams.delete('k');
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return `${PREFIX}/`;
  }
}
