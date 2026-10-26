/**
 * invoca-signal-loop: one Worker behind repos.hunterborman.com/repo/invoca.
 *
 *   /repo/invoca/login          sign-in page (public)
 *   /repo/invoca/api/unlock     POST password → hb_invoca cookie → 303 next (rate limited per IP)
 *   /repo/invoca/api/logout     POST clears cookies
 *   /repo/invoca/?k=…           signed link → hb_invoca_link cookie → 302 with k stripped
 *   /repo/invoca/?owner=…       OWNER_TOKEN → hb_invoca_owner cookie → 302 with owner stripped
 *   /repo/invoca/api/*          gated JSON API (src/worker/api)
 *   /repo/invoca/walkthrough.md gated Markdown walkthrough (docs/WALKTHROUGH.md, bundled)
 *   /repo/invoca/write-up.md, write-up/<chapter>.md, backup.md, backup/<topic>.md
 *                               gated Markdown of every write-up and Q&A page (rendered from the pages' data)
 *   /repo/invoca/README.md, docs/…md   every other doc in the registry (src/worker/mcp/docs.ts), gated
 *   /repo/invoca/switchboard-docs.zip  every chapter, question and doc plus INDEX.md, gated
 *   /repo/invoca/llms.txt       gated index in the llms.txt convention
 *   /repo/invoca/mcp            remote MCP server, bearer-token auth (src/worker/mcp)
 *   /repo/invoca/*              gated SPA assets (dist/), prefix stripped
 *
 * Every other app under repos.hunterborman.com/repo/* shares this origin, so state-changing
 * API calls must also carry `x-signal-loop: 1` and a JSON body (see `writeGuard`): neither a
 * cross-site page nor a plain HTML form on a sibling app can produce that.
 */
import { checkAccess, clearCookies, isOwnerToken, linkCookie, ownerCookie, passwordCookie, PREFIX, safeEqual, safeNext, verifyLink, type Access } from './gate';
import { clientIp, html, json, NOTICES, noticeFor, redirect, sameOrigin, secure, writeGuard, type NoticeCode } from './http';
import { loginPage } from './login';
import { api } from './api';
import { handleMcp } from './mcp/server';
import type { Env } from './env';
import { docByPath, docsZip, llmsTxt, ZIP_NAME } from './mcp/docs';

export { PipelineWorkflow } from './workflow';

const IMMUTABLE = 'public, max-age=31536000, immutable';

function withCache(res: Response, policy: string): Response {
  res.headers.set('cache-control', policy);
  return res;
}

function loginUrl(next: string, notice?: NoticeCode): string {
  return `${PREFIX}/login?next=${encodeURIComponent(safeNext(next))}${notice ? `&notice=${notice}` : ''}`;
}

/** Throws when D1 cannot answer: verifyLink then fails closed ('unavailable'). */
async function isRevoked(env: Env, jti: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM revoked_links WHERE jti = ?').bind(jti).first();
  return !!row;
}

/** Per-IP limit on password and owner-token attempts. Fails closed (no limiter → no attempt). */
async function attemptAllowed(env: Env, req: Request): Promise<boolean> {
  try {
    return (await env.RL_UNLOCK.limit({ key: `unlock:${clientIp(req)}` })).success;
  } catch {
    return false;
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
      const bad = url.searchParams.get('e') === '1';
      const code = url.searchParams.get('notice') ?? '';
      const notice = bad ? 'That password is not right. Check the invite and try again.' : noticeFor(code);
      return html(loginPage({ next: safeNext(url.searchParams.get('next')), notice }), bad ? 401 : 200);
    }
    if (path === `${PREFIX}/api/unlock`) {
      if (req.method !== 'POST') return redirect(`${PREFIX}/login`, 303);
      if (!sameOrigin(req, url)) return json(403, 'cross_origin', 'Sign in from the Signal Loop sign-in page');
      const type = req.headers.get('content-type') ?? '';
      if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(type)) return json(400, 'bad_request', 'Send the sign-in form as form data');
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return json(400, 'bad_request', 'Malformed form body');
      }
      const next = safeNext(form.get('next'));
      if (!(await attemptAllowed(env, req))) return html(loginPage({ next, notice: NOTICES.rate_limited! }), 429);
      const given = String(form.get('password') ?? '');
      if (!env.INVOCA_PASSWORD || !(await safeEqual(given, env.INVOCA_PASSWORD))) {
        // 303 back to the sign-in page, so the address bar never shows /api/unlock.
        return redirect(`${PREFIX}/login?e=1&next=${encodeURIComponent(next)}`, 303);
      }
      return redirect(next, 303, [await passwordCookie(env.INVOCA_PASSWORD)]);
    }
    if (path === `${PREFIX}/api/logout`) {
      if (req.method !== 'POST') return json(405, 'method_not_allowed', 'Sign out with POST');
      if (!sameOrigin(req, url)) return json(403, 'cross_origin', 'Cross-origin requests cannot sign you out');
      return redirect(`${PREFIX}/login?notice=signed_out`, 303, clearCookies());
    }

    // Public brand assets the sign-in page needs before any cookie exists. A missing file is a
    // 404, never the SPA shell.
    if (path.startsWith(`${PREFIX}/public/`)) {
      const res = await env.ASSETS.fetch(new Request(new URL(path.slice(PREFIX.length), url.origin), { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: req.headers }));
      if (res.status === 304) return withCache(secure(res), 'public, max-age=3600');
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
        return secure(new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
      }
      return secure(res, 'public, max-age=3600');
    }

    // ---- MCP: its own bearer-token auth (src/worker/mcp), so it sits before the cookie gate
    if (path === `${PREFIX}/mcp`) return handleMcp(req, env, ctx, (jti) => isRevoked(env, jti));

    // ---- owner token (?owner=…): same shape as a signed link, for the owner only
    const ownerParam = url.searchParams.get('owner');
    if (ownerParam !== null && !path.startsWith(`${PREFIX}/api/`)) {
      url.searchParams.delete('owner');
      const clean = safeNext(`${url.pathname}${url.search}`);
      if (!(await attemptAllowed(env, req))) return redirect(loginUrl(clean, 'rate_limited'), 302);
      if (!(await isOwnerToken(ownerParam, env.OWNER_TOKEN))) return redirect(loginUrl(clean, 'invalid'), 302);
      return redirect(clean, 302, [await ownerCookie(env.OWNER_TOKEN!)]);
    }

    // ---- signed link
    const k = url.searchParams.get('k');
    if (k) {
      const check = await verifyLink(env.LINK_SIGNING_SECRET ?? '', k, Date.now(), (jti) => isRevoked(env, jti));
      url.searchParams.delete('k');
      const clean = `${url.pathname}${url.search}`;
      if (!check.ok) return redirect(loginUrl(clean, check.reason === 'expired' ? 'expired' : check.reason === 'unavailable' ? 'unavailable' : 'invalid'), 302);
      return redirect(safeNext(clean), 302, [linkCookie(k, check.payload.exp)]);
    }

    // ---- gate
    const access: Access = await checkAccess(req.headers.get('cookie') ?? '', env, (jti) => isRevoked(env, jti));
    if (!access.ok) {
      if (path.startsWith(`${PREFIX}/api/`)) return json(401, 'unauthorized', 'Sign in required');
      const notice = access.reason === 'unavailable' ? 'unavailable' : access.reason === 'expired' ? 'expired' : access.reason ? 'invalid' : undefined;
      return redirect(loginUrl(`${path}${url.search}`, notice), 302);
    }

    // ---- API
    if (path.startsWith(`${PREFIX}/api/`)) {
      const blocked = writeGuard(req, url);
      if (blocked) return blocked;
      const res = await api.fetch(req, { ...env, ACCESS: access }, ctx);
      return secure(res);
    }

    // ---- for AI assistants (gated like everything above): each doc as Markdown, the docs .zip
    // and llms.txt, all from the one registry in src/worker/mcp/docs.ts
    const head = req.method === 'HEAD';
    const doc = docByPath(path.slice(PREFIX.length + 1));
    if (doc) return secure(new Response(head ? null : doc.text, { headers: { 'content-type': 'text/markdown; charset=utf-8' } }));
    if (path === `${PREFIX}/${ZIP_NAME}`) {
      return secure(new Response(head ? null : docsZip(), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${ZIP_NAME}"` } }));
    }
    if (path === `${PREFIX}/llms.txt`) {
      return secure(new Response(head ? null : llmsTxt(), { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    }

    // ---- SPA assets (prefix stripped). Hashed assets cache long; HTML never caches.
    path = path.slice(PREFIX.length) || '/';
    const assetReq = new Request(new URL(path, url.origin), { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: req.headers });
    const isAsset = path.startsWith('/assets/');
    let res = await env.ASSETS.fetch(assetReq);
    // 304 (If-None-Match revalidation) is a cache hit, not a redirect: pass it straight through.
    // Only real redirects (the asset server's /index.html ↔ / canonicalisation) fall back to the
    // SPA shell.
    if (res.status === 304) return withCache(secure(res), isAsset ? IMMUTABLE : 'no-store');
    if ([301, 302, 307, 308].includes(res.status)) res = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
    // A missing hashed asset (an old chunk after a redeploy) must 404, not fall through to the
    // SPA shell: a 200 text/html for a module import is what turns deploy skew into a crash.
    // The client's vite:preloadError handler then reloads onto the new build.
    if (isAsset && (res.status === 404 || (res.headers.get('content-type') ?? '').includes('text/html'))) {
      return secure(new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    }
    // Forced (set, not "set if absent"): the asset server sends its own revalidating policy.
    return withCache(secure(res), isAsset && res.ok ? IMMUTABLE : 'no-store');
  },
} satisfies ExportedHandler<Env>;
