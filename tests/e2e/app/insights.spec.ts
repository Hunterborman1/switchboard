import { expect, test, type Page } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

const rowsOf = (page: Page) => page.getByRole('table', { name: 'Insights' }).locator('tbody tr');

test.describe('Insights', () => {
  test('table with a count; the status filter lands in the URL', async ({ page }) => {
    await gotoApp(page, '/app/insights');
    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ insights?$/)).toBeVisible();
    await page.getByLabel('Filter by status').selectOption('routed');
    await expect(page).toHaveURL(/status=routed/);
    await expect(page.getByText(/^\d+ of \d+ insights?$/)).toBeVisible();
    const rows = rowsOf(page);
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Routed');
  });

  test('filters persist across reload', async ({ page }) => {
    await gotoApp(page, '/app/insights?type=bug');
    await expect(page.getByLabel('Filter by type')).toHaveValue('bug');
    await page.reload();
    await expect(page.getByLabel('Filter by type')).toHaveValue('bug');
    const rows = rowsOf(page);
    await expect(rows.first()).toBeVisible();
    const n = await rows.count();
    for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText('Bug');
  });

  test('search is debounced into the URL', async ({ page }) => {
    await gotoApp(page, '/app/insights');
    await page.getByLabel('Search insights').fill('Google Ads');
    await expect(page).toHaveURL(/q=Google/);
    await expect(rowsOf(page).first()).toContainText(/Google Ads/i);
  });

  test('a row opens the insight drawer; Esc closes and returns focus', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/insights');
    const rowLink = page.locator('[data-insight-row]').first();
    const id = await rowLink.getAttribute('data-insight-row');
    await rowLink.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/app/insights/${id}`));
    await expect(dialog.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Routing' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Review history' })).toBeVisible();
    await expect.poll(async () => (await events()).some((e) => e.name === 'insight.opened')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator(`[data-insight-row="${id}"]`)).toBeFocused();
  });

  test('deep link opens a routed insight with its delivery and receipt', async ({ page }) => {
    await gotoApp(page, '/app/insights/ins_s05');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Delivered')).toBeVisible();
    await expect(dialog.getByText('Receipt')).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Open conversation' })).toBeVisible();
  });

  test('mobile: no horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/app/insights');
    await expect(rowsOf(page).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
