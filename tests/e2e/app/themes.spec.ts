import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Themes', () => {
  test('list shows theme cards with the walkthrough anchors and filters in the URL', async ({ page }) => {
    await gotoApp(page, '/app/themes');
    const grid = page.locator('[data-tour="themes.list"]');
    await expect(grid).toBeVisible();
    await expect(grid.locator('a').first()).toBeVisible();
    await expect(page.locator('[data-tour="theme.c1042"]')).toContainText(/Offline conversions/i);
    await page.getByLabel('Type').selectOption('bug');
    await expect(page).toHaveURL(/type=bug/);
    await expect(page.locator('[data-tour="theme.c1042"]')).toHaveCount(0);
  });

  test('detail emits theme.opened and shows trend, quotes, ARR, accounts and promote', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/themes');
    await page.locator('[data-tour="theme.c1042"]').click();
    await expect(page.locator('[data-tour="theme.trend"]')).toBeVisible();
    await expect(page.locator('[data-tour="theme.quotes"]')).toBeVisible();
    await expect(page.locator('[data-tour="theme.arr"]')).toContainText('$');
    await expect(page.getByRole('heading', { name: 'Accounts affected' })).toBeVisible();
    expect((await events()).some((e) => e.name === 'theme.opened')).toBe(true);
    const promote = page.getByRole('button', { name: 'Promote to roadmap' });
    if (await promote.isEnabled()) {
      await promote.click();
      await expect(page.getByText(/Promoted to roadmap in your workspace/)).toBeVisible();
      await expect(promote).toBeDisabled();
      await expect(page.getByText('Already on the roadmap')).toBeVisible();
    }
  });
});
