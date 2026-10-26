/** Sign-in page for /repo/invoca, in the same light, flat language as the product (self-contained HTML). */
import { PREFIX } from './gate';

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function loginPage({ next, notice }: { next: string; notice?: string | null }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in · Switchboard</title>
<link rel="icon" href="${PREFIX}/public/mark.svg" type="image/svg+xml">
<link rel="preload" href="${PREFIX}/public/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
  @font-face{font-family:"Inter Variable";font-style:normal;font-weight:100 900;font-display:swap;src:url(${PREFIX}/public/fonts/inter-latin-wght-normal.woff2) format("woff2-variations"),url(${PREFIX}/public/fonts/inter-latin-wght-normal.woff2) format("woff2")}
  :root{color-scheme:light;--bg:#FFFFFF;--bg-subtle:#F7F8F7;--border:#E3E6E3;--border-strong:#CDD2CD;--text:#111614;--text-2:#525C57;--text-3:#6B756F;--accent:#008463;--accent-hover:#00785A;--accent-text:#006B51;--danger:#B42318;--danger-subtle:#FDECEA;--shadow-2:0 4px 12px rgba(16,24,20,.08),0 1px 3px rgba(16,24,20,.06)}
  *{box-sizing:border-box;margin:0}
  body{min-height:100dvh;display:grid;grid-template-rows:auto 1fr auto;background:var(--bg-subtle);color:var(--text);font:400 14px/1.5 "Inter Variable",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss03"}
  header{height:52px;display:flex;align-items:center;padding:0 24px;background:var(--bg);border-bottom:1px solid var(--border)}
  .mark{display:inline-flex;align-items:center;gap:10px;font-weight:600;font-size:14px;letter-spacing:-.01em}
  .mark span{color:var(--text-3);font-weight:400;letter-spacing:0}
  main{display:grid;place-items:center;padding:32px 16px}
  .card{width:100%;max-width:400px;padding:32px;background:var(--bg);border:1px solid var(--border);border-radius:8px;box-shadow:var(--shadow-2)}
  h1{font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.015em;color:var(--text)}
  p.lede{color:var(--text-2);margin:8px 0 24px}
  label{display:block;font-size:13px;font-weight:500;color:var(--text);margin-bottom:6px}
  input{width:100%;height:40px;padding:0 12px;border-radius:6px;border:1px solid var(--border-strong);background:var(--bg);color:var(--text);font:inherit;font-size:16px;outline:none;transition:border-color .12s}
  input:focus{border-color:var(--accent);outline:2px solid var(--accent);outline-offset:1px}
  button{width:100%;height:40px;margin-top:16px;border:0;border-radius:6px;background:#008463;color:#fff;opacity:1;font:500 14px/1 "Inter Variable",Inter,sans-serif;cursor:pointer;transition:background .12s}
  button:hover{background:var(--accent-hover)} button:active{background:var(--accent-text)}
  button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .notice{margin-bottom:16px;padding:10px 12px;border-radius:6px;background:var(--danger-subtle);color:var(--danger);font-size:13px}
  footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 24px;color:var(--text-3);font-size:13px}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<header>
  <span class="mark"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#008463"/><g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 7.5c3 0 3.5 4.5 6.5 4.5M5.5 16.5c3 0 3.5-4.5 6.5-4.5M5.5 12H12"/><path d="M12 12c3 0 3.5-4.5 6.5-4.5M12 12c3 0 3.5 4.5 6.5 4.5"/></g><circle cx="12" cy="12" r="1.6" fill="#fff"/></svg>Switchboard <span>Prepared for Invoca</span></span>
</header>
<main>
<form class="card" method="POST" action="${PREFIX}/api/unlock">
  <h1>Sign in to Switchboard</h1>
  <p class="lede">Customer conversations in, the right people out. Includes Signal Loop, the product-feedback analysis, and a guided walkthrough.</p>
  ${notice ? `<div class="notice" role="alert">${esc(notice)}</div>` : ''}
  <input type="hidden" name="next" value="${esc(next)}">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  <button type="submit">Sign in</button>
</form>
</main>
<footer><span>Hunter Borman · AI Operations Lead</span><span>Private preview</span></footer>
</body>
</html>`;
}
