import { chromium } from 'playwright';
const [url] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const apps = document.querySelectorAll('.sl-app');
  const out = { count: apps.length, gapOnApp: getComputedStyle(apps[0]).getPropertyValue('--sl-gap') };
  const rules = [];
  for (const s of document.styleSheets) { try { for (const r of s.cssRules) { if (r.selectorText === '.sl-app') rules.push(r.cssText.slice(0, 200)); } } catch {} }
  out.rules = rules;
  return out;
}));
await b.close();
