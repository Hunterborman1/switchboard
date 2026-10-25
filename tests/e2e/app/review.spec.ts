import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Review queue', () => {
  test('renders the queue, anchors and why-here popover', async ({ page }) => {
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
    for (const id of ['review.queue', 'review.item', 'review.why', 'review.evidence', 'review.approve', 'review.edit']) {
      await expect(page.locator(`[data-tour="${id}"]`).first()).toBeVisible();
    }
    await expect(page.locator('[data-tour="review.why"]')).toHaveCount(1);
    await page.locator('[data-tour="review.why"] button').click();
    await expect(page.getByTestId('severity-chip-popover')).toContainText('Expected');
    await page.keyboard.press('Escape');
  });

  test('approve with A routes the item, shows a receipt and emits review.action', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/review');
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    const before = await options.count();
    const firstSummary = await page.locator('#review-detail-title').innerText();
    await page.keyboard.press('a');
    await expect(page.getByRole('status').filter({ hasText: 'Approved' })).toBeVisible();
    await expect(page.getByText('receipt', { exact: false }).first()).toBeVisible();
    await expect(options).toHaveCount(before - 1);
    await expect(page.locator('#review-detail-title')).not.toHaveText(firstSummary);
    expect((await events()).some((e) => e.name === 'review.action')).toBe(true);
  });

  test('J/K navigate; E opens the edit form; typing does not trigger shortcuts', async ({ page }) => {
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('option').first()).toBeVisible();
    const first = await page.locator('#review-detail-title').innerText();
    await page.keyboard.press('j');
    await expect(page.locator('#review-detail-title')).not.toHaveText(first);
    await page.keyboard.press('k');
    await expect(page.locator('#review-detail-title')).toHaveText(first);
    await page.keyboard.press('e');
    const form = page.getByRole('form', { name: 'Edit insight' });
    await expect(form).toBeVisible();
    await form.locator('textarea').fill('Edited summary while typing a j k r e — shortcuts stay quiet');
    await expect(form).toBeVisible();
    await form.locator('select').nth(2).selectOption('high');
    await form.getByRole('button', { name: /Save edit/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Edited and routed' })).toBeVisible();
  });

  test('reject requires a reason', async ({ page }) => {
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('r');
    const form = page.getByRole('form', { name: 'Reject insight' });
    const submit = form.getByRole('button', { name: 'Reject', exact: true });
    await expect(submit).toBeDisabled();
    await form.getByRole('button', { name: 'Not a product issue' }).click();
    await submit.click();
    await expect(page.getByRole('status').filter({ hasText: 'Rejected' })).toBeVisible();
  });

  test('clearing the queue shows the calm empty state and emits review.empty', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('option').first()).toBeVisible();
    for (let i = 0; i < 40; i++) {
      if (await page.getByText('Queue clear').isVisible()) break;
      const btn = page.locator('[data-tour="review.approve"]');
      if (await btn.isVisible() && await btn.isEnabled()) await btn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText('Queue clear')).toBeVisible();
    expect((await events()).some((e) => e.name === 'review.empty')).toBe(true);
  });

  test('mobile: stacked layout without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/app/review');
    await expect(page.locator('[data-tour="review.queue"]')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
