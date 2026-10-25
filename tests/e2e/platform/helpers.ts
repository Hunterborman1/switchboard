import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, type BrowserContext, type Page } from '@playwright/test';

const ROOT = new URL('../../../', import.meta.url);
export const BASE = '/repo/invoca';
export const WS = 'ws_e2e0123456789abc'; // matches Signal Loop's ws_<16 hex> cookie format

function secret(name: string): string {
  for (const f of ['.dev.vars', '.env']) {
    const p = new URL(f, ROOT);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (m) return m[1]!.trim().replace(/^"|"$/g, '');
  }
  throw new Error(`${name} not found in .dev.vars or .env`);
}
export const password = () => secret('INVOCA_PASSWORD');

/** The Worker's signed workspace cookie value (src/worker/gate.ts signWorkspace). */
export function signedWorkspace(ws: string): string {
  const sig = createHmac('sha256', `signal-loop-ws-v1|${secret('LINK_SIGNING_SECRET')}`).update(ws).digest().subarray(0, 16).toString('base64url');
  return `${ws}.${sig}`;
}

/** Sign in the way the gate does (hb_invoca cookie) and pin a (signed) workspace. */
export async function signIn(ctx: BrowserContext, ws = WS, domain = 'localhost') {
  const token = createHmac('sha256', `invoca-gate|${password()}`).update('signal-loop-auth-v1').digest('hex');
  await ctx.addCookies([
    { name: 'hb_invoca', value: token, domain, path: BASE },
    { name: 'sl_ws', value: signedWorkspace(ws), domain, path: BASE },
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
