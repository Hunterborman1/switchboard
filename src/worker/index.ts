/**
 * invoca-signal-loop: one Worker behind repos.hunterborman.com/repo/invoca.
 *
 *   /repo/invoca/login          sign-in page (public)
 *   /repo/invoca/api/unlock     POST password → hb_invoca cookie → 303 next
 *   /repo/invoca/api/logout     clears cookies
 *   /repo/invoca/?k=…           signed link → hb_invoca_link cookie → 302 with k stripped
 *   /repo/invoca/api/*          gated JSON API (src/worker/api)
 *   /repo/invoca/*              gated SPA assets (dist/), prefix stripped
 */
import { checkAccess, clearCookies, linkCookie, passwordCookie, PREFIX, safeEqual, safeNext, verifyLink, type Access } from './gate';
import { loginPage } from './login';
import { api } from './api';
import type { Env } from './env';

export { PipelineWorkflow } from './workflow';

const SECURITY_HEADERS: Record<string, string> = {
  'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function secure(res: Response, cache = 'no-store'): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  if (cache && !out.headers.has('cache-control')) out.headers.set('cache-control', cache);
  return out;
}

function html(body: string, status = 200): Response {
  return secure(new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } }));
}

function redirect(to: string, status: 302 | 303, cookies: string[] = []): Response {
  const headers = new Headers({ location: to });
  for (const c of cookies) headers.append('set-cookie', c);
  return secure(new Response(null, { status, headers }));
}

async function isRevoked(env: Env, jti: string): Promise<boolean> {
  try {
    const row = await env.DB.prepare('SELECT 1 FROM revoked_links WHERE jti = ?').bind(jti).first();
    return !!row;
  } catch {
    return false; // table missing before first migration: nothing is revoked
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === PREFIX) return redirect(`${PREFIX}/${url.search}`, 302);
    if (!path.startsWith(`${PREFIX}/`)) return secure(new Response('Not found', { status: 404 }));

    // ---- public: sign-in
    if (path === `${PREFIX}/login`) {
      const notice = url.searchParams.get('e') === '1' ? 'That password is not right. Check the invite and try again.' : url.searchParams.get('notice');
      return html(loginPage({ next: safeNext(url.searchParams.get('next')), notice }), url.searchParams.get('e') === '1' ? 401 : 200);
    }
    if (path === `${PREFIX}/api/unlock`) {
      if (req.method !== 'POST') return redirect(`${PREFIX}/login`, 303);
      const type = req.headers.get('content-type') ?? '';
      if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(type)) {
        return secure(Response.json({ error: { code: 'bad_request', message: 'Send the sign-in form as form data' } }, { status: 400 }));
      }
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return secure(Response.json({ error: { code: 'bad_request', message: 'Malformed form body' } }, { status: 400 }));
      }
      const next = safeNext(form.get('next'));
      const given = String(form.get('password') ?? '');
      if (!env.INVOCA_PASSWORD || !(await safeEqual(given, env.INVOCA_PASSWORD))) {
        // 303 back to the sign-in page, so the address bar never shows /api/unlock.
        return redirect(`${PREFIX}/login?e=1&next=${encodeURIComponent(next)}`, 303);
      }
      return redirect(next, 303, [await passwordCookie(env.INVOCA_PASSWORD)]);
    }
    if (path === `${PREFIX}/api/logout`) return redirect(`${PREFIX}/login`, 303, clearCookies());

    // Public brand assets the sign-in page needs before any cookie exists.
    if (path.startsWith(`${PREFIX}/public/`)) {
      const res = await env.ASSETS.fetch(new Request(new URL(path.slice(PREFIX.length), url.origin), req));
      return secure(res, res.ok ? 'public, max-age=3600' : 'no-store');
    }

    // ---- signed link
    const k = url.searchParams.get('k');
    if (k) {
      const check = await verifyLink(env.LINK_SIGNING_SECRET ?? '', k, Date.now(), (jti) => isRevoked(env, jti));
      url.searchParams.delete('k');
      const clean = `${url.pathname}${url.search}`;
      if (!check.ok) {
        const notice = check.reason === 'expired' ? 'This link has expired. Sign in with the password instead.' : 'This link is not valid. Sign in with the password instead.';
        return redirect(`${PREFIX}/login?next=${encodeURIComponent(safeNext(clean))}&notice=${encodeURIComponent(notice)}`, 302);
      }
      return redirect(safeNext(clean), 302, [linkCookie(k, check.payload.exp)]);
    }

    // ---- gate
    const access: Access = await checkAccess(req.headers.get('cookie') ?? '', env, (jti) => isRevoked(env, jti));
    if (!access.ok) {
      if (path.startsWith(`${PREFIX}/api/`)) {
        return secure(Response.json({ error: { code: 'unauthorized', message: 'Sign in required' } }, { status: 401 }));
      }
      return redirect(`${PREFIX}/login?next=${encodeURIComponent(`${path}${url.search}`)}`, 302);
    }

    // ---- API
    if (path.startsWith(`${PREFIX}/api/`)) {
      const res = await api.fetch(req, { ...env, ACCESS: access }, ctx);
      return secure(res);
    }

    // ---- SPA assets (prefix stripped). Hashed assets cache long; HTML never caches.
    path = path.slice(PREFIX.length) || '/';
    const assetReq = new Request(new URL(path, url.origin), { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: req.headers });
    let res = await env.ASSETS.fetch(assetReq);
    if (res.status >= 300 && res.status < 400) res = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
    // A missing hashed asset (an old chunk after a redeploy) must 404, not fall through to the
    // SPA shell: a 200 text/html for a module import is what turns deploy skew into a crash.
    // The client's vite:preloadError handler then reloads onto the new build.
    if (path.startsWith('/assets/') && (res.status === 404 || (res.headers.get('content-type') ?? '').includes('text/html'))) {
      return secure(new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    }
    const immutable = path.startsWith('/assets/') && res.ok;
    return secure(res, immutable ? 'public, max-age=31536000, immutable' : 'no-store');
  },
} satisfies ExportedHandler<Env>;
