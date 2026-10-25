// Visual QA helper (not a test): screenshots product pages at several widths.
// usage: node tests/e2e/ux/shoot.mjs <outDir> <base> <route[,route...]> [widths] [waitMs]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [outDir, base, routesArg, widthsArg = '1440,1024,390', waitArg = '1200'] = process.argv.slice(2);
const routes = routesArg.split(',');
const widths = widthsArg.split(',').map(Number);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${w}]`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[console ${w}]`, m.text()); });
  for (const r of routes) {
    const [path, action] = r.split('@');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(Number(waitArg));
    if (action) {
      for (const a of action.split('+')) {
        if (a.startsWith('click:')) { await page.click(a.slice(6)).catch((e) => console.log('click fail', a, e.message)); await page.waitForTimeout(700); }
        if (a.startsWith('wait:')) await page.waitForTimeout(Number(a.slice(5)));
        if (a.startsWith('key:')) { await page.keyboard.press(a.slice(4)); await page.waitForTimeout(400); }
      }
    }
    const name = `${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}${action ? '_' + action.replace(/[^a-z0-9]+/gi, '').slice(0, 24) : ''}_${w}.png`;
    const full = process.env.FULL === '1';
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(name, overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : 'ok');
  }
  await ctx.close();
}
await browser.close();
