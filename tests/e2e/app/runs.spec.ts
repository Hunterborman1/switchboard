import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('Runs list', () => {
  test('lists a new run and links to its run view', async ({ page }) => {
    await gotoApp(page, '/app/runs');
    await expect(page.getByRole('heading', { name: 'Runs', level: 1 })).toBeVisible();
    // Start a run through the API client the page itself uses (fixture mode).
    await page.evaluate(async () => {
      const m = await import('/repo/invoca/src/app/api/client.ts');
      const lib = await m.api.library();
      await m.api.createRun({ fileId: lib.data[0]!.id, mode: 'auto' });
    });
    // The fixture workspace is in memory: no reload; the list polls every ~5s.
    const link = page.locator('[data-testid="data-table-row"] a[href*="/app/runs/run_"]').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect(page).toHaveURL(/#\/app\/runs\/run_/);
  });

  test('status filter lives in the URL', async ({ page }) => {
    await gotoApp(page, '/app/runs');
    await page.getByRole('radio', { name: /^Completed/ }).click();
    await expect(page).toHaveURL(/status=completed/);
    await page.getByRole('radio', { name: /^All/ }).click();
    await expect(page).not.toHaveURL(/status=/);
  });

  test('unknown routes show a calm not-found state', async ({ page }) => {
    await gotoApp(page, '/app/does-not-exist');
    await expect(page.getByText('There is nothing at this address')).toBeVisible();
  });
});
