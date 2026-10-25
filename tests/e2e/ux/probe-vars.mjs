import { chromium } from 'playwright';
const [url, sel, ...vars] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
console.log(await p.evaluate(([sel, vars]) => { const el = document.querySelector(sel); const cs = getComputedStyle(el); return vars.map(v => `${v}=${cs.getPropertyValue(v)}`); }, [sel, vars]));
await b.close();
