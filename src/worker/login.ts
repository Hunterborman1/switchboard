/** Sign-in page for /repo/invoca, in the Signal Loop Narrative look (self-contained HTML). */
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
<title>Sign in · Signal Loop</title>
<link rel="icon" href="${PREFIX}/public/mark.svg" type="image/svg+xml">
<style>
  :root { color-scheme: dark; --bg:#0A231E; --bg-2:#0E2C26; --ink:#F2F5E4; --ink-2:rgba(242,245,228,.68); --ink-3:rgba(242,245,228,.48); --line:rgba(242,245,228,.12); --accent:#8EE58E; --mint:#D1FFD1; --danger:#FF9C8C; }
  *{box-sizing:border-box;margin:0}
  body{min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(1200px 600px at 70% -10%,rgba(142,229,142,.10),transparent 60%),var(--bg);color:var(--ink);font:450 15px/1.5 "Inter Tight",Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .card{width:100%;max-width:420px;animation:rise .7s cubic-bezier(.22,1,.36,1) both}
  @keyframes rise{from{opacity:0;transform:translateY(10px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
  .eyebrow{font:500 11px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:10px}
  .eyebrow i{width:6px;height:6px;border-radius:9px;background:var(--accent);box-shadow:0 0 12px var(--accent);animation:pulse 1.8s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  h1{font:400 44px/1.05 "Instrument Serif",Georgia,serif;letter-spacing:-.01em;margin:18px 0 10px}
  h1 em{color:var(--mint)}
  p.lede{color:var(--ink-2);margin-bottom:28px}
  label{display:block;font:500 11px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:10px}
  input{width:100%;height:48px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--bg-2);color:var(--ink);font:inherit;font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s}
  input:focus{border-color:var(--accent);box-shadow:0 0 0 4px rgba(142,229,142,.15)}
  button{width:100%;height:48px;margin-top:12px;border:0;border-radius:8px;background:var(--accent);color:#0A231E;font:600 15px/1 "Inter Tight",Inter,sans-serif;cursor:pointer;transition:transform .15s,background .2s}
  button:hover{background:var(--mint)} button:active{transform:translateY(1px)}
  button:focus-visible{outline:2px solid var(--mint);outline-offset:3px}
  .notice{margin-bottom:16px;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,156,140,.35);background:rgba(255,156,140,.08);color:var(--danger);font-size:14px}
  .foot{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);color:var(--ink-3);font-size:13px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<form class="card" method="POST" action="${PREFIX}/api/unlock">
  <div class="eyebrow"><i></i>Signal Loop · prepared for Invoca</div>
  <h1>Every call is a <em>signal.</em></h1>
  <p class="lede">An interactive walkthrough of a working system that turns CSM conversations into routed, evidence-backed product insight.</p>
  ${notice ? `<div class="notice" role="alert">${esc(notice)}</div>` : ''}
  <input type="hidden" name="next" value="${esc(next)}">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  <button type="submit">Enter</button>
  <div class="foot"><span>Hunter Borman · AI Operations Lead</span><span>Private preview</span></div>
</form>
</body>
</html>`;
}
