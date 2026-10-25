import { expect, test } from '@playwright/test';
import { anchor, BASE, open, signIn } from './helpers';

test.beforeEach(async ({ context }) => signIn(context));

test('usage: the live panel marks the viewer as "That’s you"', async ({ page }) => {
  // Report a live session from this workspace through Signal Loop's real telemetry endpoint.
  const now = new Date().toISOString();
  const r = await page.request.post(`${BASE}/api/telemetry`, {
    data: { sessionId: 'ses_e2e_you', events: [{ kind: 'session_start', path: '/app', at: now }, { kind: 'tour_step', path: '/walkthrough', props: { step: 'ch1' }, at: now }] },
  });
  expect(r.ok()).toBe(true);
  await open(page, '/ops/usage');
  const live = anchor(page, 'ops.usage.live');
  await expect(live).toContainText('Live right now');
  await expect(live.locator('[data-you="true"]').first()).toContainText('That’s you', { timeout: 25_000 });
  expect(Number(await page.getByTestId('live-active').innerText())).toBeGreaterThanOrEqual(1);
});

test('usage: heatmap, top 3 users, filters synced to the URL, timezone toggle', async ({ page }) => {
  await open(page, '/ops/usage');
  await expect(anchor(page, 'ops.usage.heatmap').getByRole('gridcell')).toHaveCount(168);
  await expect(page.getByTestId('top-users').locator('li')).toHaveCount(3);
  await page.getByRole('group', { name: 'Data source' }).getByRole('button', { name: 'Simulated' }).click();
  await expect(page).toHaveURL(/source=simulated/);
  await page.getByRole('radio', { name: 'PT' }).click();
  await expect(anchor(page, 'ops.usage.heatmap')).toContainText('Pacific time');
});
