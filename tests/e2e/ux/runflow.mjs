// Visual QA: start a run for a library file and capture the Run view over time.
// usage: node tests/e2e/ux/runflow.mjs <outDir> <fileId> <width> <shotsMs comma list> [prefix]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [outDir, fileId, widthArg = '1440', shotsArg = '1500,4000,9000', prefix = 'run'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const w = Number(widthArg);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
const base = 'http://localhost:5179/repo/invoca/src/app/dev/index.html?notrack=1#';
await p.goto(`${base}/app/new`, { waitUntil: 'networkidle' });
await p.click('[data-tour="new.upload"]');
await p.waitForSelector('[data-tour="picker.dialog"]');
await p.fill('input[type=search]', fileId.replace('file_', '').split('_')[0]);
await p.waitForTimeout(300);
const row = p.locator(`[data-file="${fileId}"]`);
await row.click();
await p.click('[data-tour="picker.open"]');
await p.click('[data-tour="new.run"]');
const t0 = Date.now();
for (const ms of shotsArg.split(',').map(Number)) {
  const wait = ms - (Date.now() - t0);
  if (wait > 0) await p.waitForTimeout(wait);
  await p.screenshot({ path: `${outDir}/${prefix}_${w}_${ms}.png`, fullPage: process.env.FULL === '1' });
  console.log('shot', ms, p.url());
}
const events = await p.evaluate(() => 0);
await b.close();
