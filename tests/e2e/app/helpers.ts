import type { Page } from '@playwright/test';

/** The fixture-mode product harness (hash routing). */
export const HARNESS = '/repo/invoca/src/app/dev/index.html';

/** Open a product route, e.g. gotoApp(page, '/app/review'). Telemetry is disabled. */
export async function gotoApp(page: Page, path: string, opts: { tour?: boolean; pace?: number } = {}) {
  const extra = [opts.tour ? 'tour=1' : '', opts.pace != null ? `pace=${opts.pace}` : ''].filter(Boolean).join('&');
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${HARNESS}?notrack=1#${path}${extra ? `${sep}${extra}` : ''}`);
  await page.locator('.sl-app').waitFor();
}

/** Collect product → walkthrough events (src/shared/events.ts) emitted on the page. */
export async function captureEvents(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __slEvents: unknown[] }).__slEvents = [];
    window.addEventListener('signal-loop', (e) => (window as unknown as { __slEvents: unknown[] }).__slEvents.push((e as CustomEvent).detail));
  });
  return async () => page.evaluate(() => (window as unknown as { __slEvents: { name: string }[] }).__slEvents);
}
