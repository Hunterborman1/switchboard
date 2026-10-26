import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Review queue', () => {
  test('renders the split view, every walkthrough anchor and the why-here tooltip', async ({ page }) => {
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
    for (const id of ['review.queue', 'review.item', 'review.why', 'review.evidence', 'review.approve', 'review.edit']) {
      await expect(page.locator(`[data-tour="${id}"]`).first()).toBeVisible();
    }
    await expect(page.locator('[data-tour="review.why"]')).toHaveCount(1);
    await page.locator('[data-tour="review.why"]').focus();
    await expect(page.getByRole('tooltip')).toContainText('A person checks it first');
    await page.keyboard.press('Escape');
  });

  test('approve with A sends the item, says where it went and emits review.action', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/review');
    const options = page.getByRole('listbox', { name: 'Review queue' }).getByRole('option');
    await expect(options.first()).toBeVisible();
    const before = await options.count();
    const firstSummary = await page.locator('#review-detail-title').innerText();
    await page.keyboard.press('a');
    const toast = page.getByRole('status').filter({ hasText: 'Sent to' });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Receipt');
    await expect(options).toHaveCount(before - 1);
    await expect(page.locator('#review-detail-title')).not.toHaveText(firstSummary);
    expect((await events()).some((e) => e.name === 'review.action')).toBe(true);
  });

  test('J/K navigate; E opens the edit form; typing does not trigger shortcuts', async ({ page }) => {
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('listbox', { name: 'Review queue' }).getByRole('option').first()).toBeVisible();
    const first = await page.locator('#review-detail-title').innerText();
    await page.keyboard.press('j');
    await expect(page.locator('#review-detail-title')).not.toHaveText(first);
    await page.keyboard.press('k');
    await expect(page.locator('#review-detail-title')).toHaveText(first);
    await page.keyboard.press('e');
    const form = page.getByRole('form', { name: 'Edit insight' });
    await expect(form).toBeVisible();
    await expect(page.locator('[data-tour="review.editform"]')).toBeVisible();
    await form.locator('textarea').fill('Edited summary while typing a j k r e — shortcuts stay quiet');
    await expect(form).toBeVisible();
    await form.locator('select').nth(2).selectOption('high');
    await form.getByRole('button', { name: 'Save and send' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Edited and sent to' })).toBeVisible();
  });

  test('reject takes an optional reason and says nothing was sent', async ({ page }) => {
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('listbox', { name: 'Review queue' }).getByRole('option').first()).toBeVisible();
    await page.keyboard.press('r');
    const form = page.getByRole('form', { name: 'Reject insight' });
    const submit = form.getByRole('button', { name: 'Reject', exact: true });
    await expect(submit).toBeEnabled();
    await form.getByRole('button', { name: 'Not a product issue' }).click();
    await submit.click();
    const toast = page.getByRole('status').filter({ hasText: 'Rejected' });
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Not a product issue');
  });

  test('clearing the queue shows the calm empty state and emits review.empty', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/review');
    await expect(page.getByRole('listbox', { name: 'Review queue' }).getByRole('option').first()).toBeVisible();
    for (let i = 0; i < 40; i++) {
      if (await page.getByText('Nothing waiting for review').isVisible()) break;
      const btn = page.locator('[data-tour="review.approve"]');
      if ((await btn.isVisible()) && (await btn.isEnabled())) await btn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText('Nothing waiting for review')).toBeVisible();
    expect((await events()).some((e) => e.name === 'review.empty')).toBe(true);
  });

  test('mobile: stacked layout without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoApp(page, '/app/review');
    await expect(page.locator('[data-tour="review.queue"]')).toBeVisible();
    await expect(page.locator('[data-tour="review.approve"]')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
