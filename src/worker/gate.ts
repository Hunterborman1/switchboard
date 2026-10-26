/**
 * Access for /repo/invoca: its own password, a 7-day signed link, and an owner token.
 *
 *   password   INVOCA_PASSWORD → `hb_invoca` cookie (HMAC of a fixed context under the
 *              password; rotating the password logs every session out).
 *   signed     ?k=<b64url(payload)>.<b64url(hmac)> with payload {aud:"invoca",exp,jti},
 *   link       HMAC-SHA256 under LINK_SIGNING_SECRET. A valid link sets `hb_invoca_link`
 *              (the token itself, Max-Age capped at exp) and redirects with `k` stripped.
 *              Revoke one link by adding its jti to D1 `revoked_links`; revoke all by
 *              rotating the secret. The password keeps working either way. The revocation
 *              lookup fails closed: if D1 cannot answer, the link is refused (the password
 *              cookie never depends on D1, so a D1 hiccup cannot lock everyone out).
 *   owner      ?owner=<OWNER_TOKEN> (a random secret only the owner holds; see
 *              scripts/owner-link.ts) sets `hb_invoca_owner`, an HMAC under OWNER_TOKEN.
 *              It unlocks the site and marks the session as owner (PUT /api/settings).
 *              Nothing on the shared host (no hb_auth / SITE_PASSWORD) grants owner here.
 *
 * The viewer workspace cookie `sl_ws` is signed here too: `ws_<16 hex>.<b64url(hmac)>` under
 * a key derived from LINK_SIGNING_SECRET, so a workspace id cannot be guessed or forged.
 */

export const PREFIX = '/repo/invoca';
const PW_COOKIE = 'hb_invoca';
const LINK_COOKIE = 'hb_invoca_link';
const OWNER_COOKIE = 'hb_invoca_owner';
const PW_MAX_AGE = 14 * 24 * 3600;
const OWNER_MAX_AGE = 14 * 24 * 3600;

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function hmac(keyMaterial: string, message: string): Promise<ArrayBuffer> {
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

export function readCookie(header: string, name: string): string | null {
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
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

export type LinkFailure = 'malformed' | 'bad_signature' | 'expired' | 'wrong_audience' | 'revoked' | 'unavailable';
export type LinkCheck = { ok: true; payload: LinkPayload } | { ok: false; reason: LinkFailure };

/**
 * `isRevoked` may throw (D1 unavailable): the link is then refused with reason 'unavailable'
 * (fail closed), so the caller can say "try again, or use the password".
 */
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
  if (isRevoked) {
    try {
      if (await isRevoked(String(payload.jti ?? ''))) return { ok: false, reason: 'revoked' };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }
  return { ok: true, payload };
}

export function linkCookie(token: string, exp: number, now = Date.now()): string {
  const maxAge = Math.max(0, Math.floor(exp - now / 1000));
  return `${LINK_COOKIE}=${encodeURIComponent(token)}; Path=${PREFIX}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// ------------------------------------------------------------------ owner (OWNER_TOKEN)

const MIN_OWNER_TOKEN = 32;

export async function ownerSessionToken(ownerToken: string): Promise<string> {
  return hex(await hmac(`invoca-owner|${ownerToken}`, 'signal-loop-owner-v1'));
}

/** Does `given` (from ?owner=) match OWNER_TOKEN? An unset or short OWNER_TOKEN never matches. */
export async function isOwnerToken(given: string, ownerToken: string | undefined): Promise<boolean> {
  if (!ownerToken || ownerToken.length < MIN_OWNER_TOKEN || !given) return false;
  return safeEqual(given, ownerToken);
}

export async function ownerCookie(ownerToken: string): Promise<string> {
  return `${OWNER_COOKIE}=${await ownerSessionToken(ownerToken)}; Path=${PREFIX}; HttpOnly; Secure; SameSite=Lax; Max-Age=${OWNER_MAX_AGE}`;
}

// ------------------------------------------------------------------ the decision

export type GateEnv = { INVOCA_PASSWORD?: string; LINK_SIGNING_SECRET?: string; OWNER_TOKEN?: string };
/** How a request got in. 'mcp' is a workspace-scoped bearer token (src/worker/mcp/token.ts). */
export type Access = { ok: false; reason?: LinkFailure } | { ok: true; via: 'password' | 'link' | 'owner' | 'mcp'; linkExpiresAt: string | null };

export async function checkAccess(cookieHeader: string, env: GateEnv, isRevoked?: (jti: string) => Promise<boolean>): Promise<Access> {
  const owner = readCookie(cookieHeader, OWNER_COOKIE);
  if (owner && env.OWNER_TOKEN && env.OWNER_TOKEN.length >= MIN_OWNER_TOKEN && /^[a-f0-9]{64}$/.test(owner) && (await safeEqual(owner, await ownerSessionToken(env.OWNER_TOKEN)))) {
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
    return { ok: false, reason: r.reason };
  }
  return { ok: false };
}

export function clearCookies(): string[] {
  return [PW_COOKIE, LINK_COOKIE, OWNER_COOKIE].map((n) => `${n}=; Path=${PREFIX}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

/** Only same-prefix relative paths are allowed as post-login destinations. */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith(`${PREFIX}/`) || value.startsWith('//') || value.includes('\\')) return `${PREFIX}/`;
  try {
    const u = new URL(value, 'https://repos.hunterborman.com');
    if (u.host !== 'repos.hunterborman.com' || !u.pathname.startsWith(`${PREFIX}/`)) return `${PREFIX}/`;
    u.searchParams.delete('k');
    u.searchParams.delete('owner');
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return `${PREFIX}/`;
  }
}

// ------------------------------------------------------------------ signed workspace cookie

export const WS_COOKIE = 'sl_ws';
export const WS_RE = /^ws_[a-f0-9]{16}$/;
const WS_MAX_AGE = 30 * 86400;

function wsKey(secret: string | undefined): string {
  // Domain-separated from the link signatures; a fixed dev key only when the secret is unset.
  return `signal-loop-ws-v1|${secret || 'dev-only-unset-link-secret'}`;
}

export async function signWorkspace(ws: string, secret: string | undefined): Promise<string> {
  const sig = b64url(new Uint8Array(await hmac(wsKey(secret), ws)).slice(0, 16));
  return `${ws}.${sig}`;
}

/** The workspace id from a signed `sl_ws` value, or null (unsigned legacy, forged, malformed). */
export async function verifyWorkspace(value: string | null, secret: string | undefined): Promise<string | null> {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot < 0) return null;
  const ws = value.slice(0, dot);
  if (!WS_RE.test(ws)) return null;
  return (await safeEqual(await signWorkspace(ws, secret), value)) ? ws : null;
}

export function newWorkspaceId(): string {
  return `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function workspaceCookie(ws: string, secret: string | undefined): Promise<string> {
  return `${WS_COOKIE}=${await signWorkspace(ws, secret)}; Path=${PREFIX}; HttpOnly; Secure; SameSite=Lax; Max-Age=${WS_MAX_AGE}`;
}

/** How Agent Ops shows a workspace id: a short, stable prefix (never the full id). */
export function publicWorkspaceId(s: string): string {
  return s.replace(/\bws_([a-f0-9]{16})\b/g, (_m, h: string) => `ws_${h.slice(0, 6)}`);
}
