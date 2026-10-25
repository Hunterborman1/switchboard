import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Insights', () => {
  test('table with denominators; a status tile filters and lands in the URL', async ({ page }) => {
    await gotoApp(page, '/app/insights');
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ insights/)).toBeVisible();
    await page.getByRole('button', { name: /^Routed/ }).click();
    await expect(page).toHaveURL(/status=routed/);
    const rows = page.getByTestId('data-table-row');
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Routed');
  });

  test('filters persist across reload', async ({ page }) => {
    await gotoApp(page, '/app/insights?type=bug');
    await expect(page.getByLabel('Type', { exact: true })).toHaveValue('bug');
    await page.reload();
    await expect(page.getByLabel('Type', { exact: true })).toHaveValue('bug');
    const rows = page.getByTestId('data-table-row');
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Bug');
  });

  test('search is debounced into the URL', async ({ page }) => {
    await gotoApp(page, '/app/insights');
    await page.getByLabel('Search insights').fill('Google Ads');
    await expect(page).toHaveURL(/q=Google/);
    await expect(page.getByTestId('data-table-row').first()).toContainText(/Google Ads/i);
  });

  test('a row opens the provenance drawer; Esc closes and returns focus', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/insights');
    const rowBtn = page.locator('[data-insight-row]').first();
    const id = await rowBtn.getAttribute('data-insight-row');
    await rowBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/app/insights/${id}`));
    await expect(dialog.getByTestId('provenance-flow')).toBeVisible();
    await expect(dialog.getByText('Review history')).toBeVisible();
    await expect.poll(async () => (await events()).some((e) => e.name === 'insight.opened')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator(`[data-insight-row="${id}"]`)).toBeFocused();
  });

  test('deep link opens a routed insight with its delivery timeline', async ({ page }) => {
    await gotoApp(page, '/app/insights/ins_s05');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('delivery-timeline')).toBeVisible();
  });

  test('mobile: no horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/app/insights');
    await expect(page.getByText(/\d+ of \d+ insights/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
