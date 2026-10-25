import { chromium } from 'playwright';
const [url, ...sels] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
for (const s of sels) {
  const r = await p.evaluate((s) => { const el = document.querySelector(s); if (!el) return 'missing'; const cs = getComputedStyle(el); return { cls: el.className, padding: cs.padding, height: cs.height, transform: cs.transform, display: cs.display, bg: cs.backgroundColor }; }, s);
  console.log(s, JSON.stringify(r));
}
const sheets = await p.evaluate(() => [...document.styleSheets].map((s) => { try { return [...s.cssRules].filter(r => r.cssText.includes('sl-panel-head')).map(r=>r.cssText.slice(0,120)); } catch { return []; } }).flat());
console.log(sheets);
await b.close();
