/**
 * The built SPA served by the real Worker (wrangler dev on :8812, assets from dist/), not by
 * vite: revisiting a page in the same browser context must render again (asset revalidation
 * 304s once turned into 404s → blank page), and the Worker's CSP must not block anything the
 * app needs. Skips when dist/ has not been built (`npm run build`).
 */
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { password, signIn } from './helpers';

const WORKER = 'http://127.0.0.1:8812';
const built = existsSync(new URL('../../../dist/index.html', import.meta.url));

test.skip(!built, 'dist/ is not built');
test.use({ baseURL: WORKER });

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/repo/invoca/assets/') && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });
  return problems;
}

async function rendered(page: Page) {
  await expect(page.locator('#root > *').first()).toBeVisible({ timeout: 20_000 });
}

test('a page loads again on revisit in the same context, under the CSP', async ({ context, page }) => {
  await signIn(context, undefined, '127.0.0.1');
  const problems = watch(page);
  for (const path of ['/repo/invoca/', '/repo/invoca/ops']) {
    const first = await page.goto(path);
    expect(first?.headers()['content-security-policy']).toContain("script-src 'self'");
    await rendered(page);
    await page.goto(path); // revisit: cached assets
    await rendered(page);
    await page.reload(); // revalidation of the document
    await rendered(page);
  }
  // A second tab in the same context (shared cache) renders too.
  const again = await context.newPage();
  const more = watch(again);
  await again.goto('/repo/invoca/ops');
  await rendered(again);
  expect([...problems, ...more]).toEqual([]);
});

test('the sign-in page renders under the CSP (inline styles, self-hosted fonts)', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/repo/invoca/login');
  await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('signing in through the real form works (Origin: null under the referrer policy)', async ({ page }) => {
  await page.goto('/repo/invoca/login');
  await page.getByLabel(/password/i).fill(password());
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await rendered(page);
});
