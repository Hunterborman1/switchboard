import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, type BrowserContext, type Page } from '@playwright/test';

const ROOT = new URL('../../../', import.meta.url);
export const BASE = '/repo/invoca';
export const WS = 'ws_e2e0123456789abc'; // matches Signal Loop's ws_<16 hex> cookie format

function password(): string {
  for (const f of ['.dev.vars', '.env']) {
    const p = new URL(f, ROOT);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^INVOCA_PASSWORD=(.*)$/m);
    if (m) return m[1]!.trim().replace(/^"|"$/g, '');
  }
  throw new Error('INVOCA_PASSWORD not found in .dev.vars or .env');
}

/** Sign in the way the gate does (hb_invoca cookie) and pin a workspace. */
export async function signIn(ctx: BrowserContext, ws = WS) {
  const token = createHmac('sha256', `invoca-gate|${password()}`).update('signal-loop-auth-v1').digest('hex');
  await ctx.addCookies([
    { name: 'hb_invoca', value: token, domain: 'localhost', path: BASE },
    { name: 'sl_ws', value: ws, domain: 'localhost', path: BASE },
  ]);
}

export async function open(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await expect(page.locator('.ao-page h1').first()).toBeVisible();
}

export const anchor = (page: Page, id: string) => page.locator(`[data-tour="${id}"]`);

/** No horizontal page scroll at the current width. */
export async function noHorizontalScroll(page: Page) {
  const [sw, vw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(vw + 1);
}
