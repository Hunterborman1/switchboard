import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('Conversations list', () => {
  test('lists a new conversation and links to its page', async ({ page }) => {
    await gotoApp(page, '/app/runs');
    await expect(page.getByRole('heading', { name: 'Conversations', level: 1 })).toBeVisible();
    // Start a run through the API client the page itself uses (fixture mode).
    await page.evaluate(async () => {
      const m = await import('/repo/invoca/src/app/api/client.ts');
      const lib = await m.api.library();
      await m.api.createRun({ fileId: lib.data[0]!.id, mode: 'auto' });
    });
    // The fixture workspace is in memory: no reload; the list polls every ~5s.
    const link = page.getByRole('table', { name: 'Conversations' }).locator('a[href*="/app/runs/run_"]').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await expect(page).toHaveURL(/#\/app\/runs\/run_/);
  });

  test('status, source and search filters live in the URL', async ({ page }) => {
    await gotoApp(page, '/app/runs');
    const status = page.getByRole('group', { name: 'Filter by status' });
    await status.getByRole('button', { name: /^Done/ }).click();
    await expect(page).toHaveURL(/status=completed/);
    await expect(status.getByRole('button', { name: /^Done/ })).toHaveAttribute('aria-pressed', 'true');
    await status.getByRole('button', { name: /^All/ }).click();
    await expect(page).not.toHaveURL(/status=/);
    await page.getByRole('searchbox', { name: 'Search conversations' }).fill('zzz-no-such-file');
    await expect(page).toHaveURL(/q=zzz-no-such-file/);
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/q=/);
  });

  test('sorting by a column updates the URL', async ({ page }) => {
    await gotoApp(page, '/app/runs');
    await page.getByRole('button', { name: /^Conversation/ }).click();
    await expect(page).toHaveURL(/sort=name/);
  });

  test('unknown routes show a calm not-found state', async ({ page }) => {
    await gotoApp(page, '/app/does-not-exist');
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Overview' })).toBeVisible();
  });
});
