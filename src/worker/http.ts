/**
 * Response helpers and request guards for the Worker entry (index.ts). They live here because
 * a Worker's main module may only export handlers.
 */
import { PREFIX } from './gate';

/**
 * CSP: everything is first-party. The SPA is one module script plus hashed chunks; styles are
 * hashed CSS plus React style props (CSSOM, not governed by style-src) and the sign-in page's
 * inline <style>, hence 'unsafe-inline' for styles only. Fonts are self-hosted woff2.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': CSP,
  'strict-transport-security': 'max-age=31536000',
  'cross-origin-opener-policy': 'same-origin',
};

export function secure(res: Response, cache = 'no-store'): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  if (cache && !out.headers.has('cache-control')) out.headers.set('cache-control', cache);
  return out;
}

export function html(body: string, status = 200): Response {
  return secure(new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } }));
}

export function json(status: number, code: string, message: string): Response {
  return secure(Response.json({ error: { code, message } }, { status }));
}

export function redirect(to: string, status: 302 | 303, cookies: string[] = []): Response {
  const headers = new Headers({ location: to });
  for (const c of cookies) headers.append('set-cookie', c);
  return secure(new Response(null, { status, headers }));
}

/** Sign-in notices are codes, never free text from the URL. */
export const NOTICES: Record<string, string> = {
  expired: 'This link has expired. Sign in with the password instead.',
  invalid: 'This link is not valid. Sign in with the password instead.',
  unavailable: 'We could not check this link just now. Try it again in a minute, or sign in with the password.',
  signed_out: 'You are signed out.',
  rate_limited: 'Too many sign-in attempts. Wait a minute and try again.',
};
export type NoticeCode = 'expired' | 'invalid' | 'unavailable' | 'signed_out' | 'rate_limited';

export function noticeFor(code: string | null): string | null {
  return code && Object.prototype.hasOwnProperty.call(NOTICES, code) ? NOTICES[code]! : null;
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown';
}

/** The request comes from a page on this origin (or from a non-browser client with no headers). */
export function sameOrigin(req: Request, url: URL): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const o = new URL(origin);
      const host = req.headers.get('host');
      if (o.host !== url.host && o.host !== host) return false;
    } catch {
      return false; // "null" and other opaque origins
    }
  }
  return true;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Endpoints a browser reaches with navigator.sendBeacon, which cannot set custom headers. */
const BEACON_PATHS = new Set([`${PREFIX}/api/telemetry`]);

/**
 * CSRF / cross-app guard for state-changing API calls. Null when the request may proceed.
 * Same origin is not enough on its own (every /repo/* app shares it), so writes also need a
 * JSON body and the app's `x-signal-loop: 1` header, which a plain form post cannot send.
 */
export function writeGuard(req: Request, url: URL): Response | null {
  if (SAFE_METHODS.has(req.method)) return null;
  if (!sameOrigin(req, url)) return json(403, 'cross_origin', 'Cross-origin requests cannot change state');
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return json(415, 'unsupported_media_type', 'Send a JSON body (content-type: application/json)');
  if (!BEACON_PATHS.has(url.pathname) && req.headers.get('x-signal-loop') !== '1') return json(403, 'missing_header', 'Requests that change state must come from the Signal Loop app');
  return null;
}
