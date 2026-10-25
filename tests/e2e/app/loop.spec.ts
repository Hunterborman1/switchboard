import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('CSM loop', () => {
  test('shows the weekly headline, inbox and the drafted customer note', async ({ page }) => {
    await gotoApp(page, '/app/loop');
    await expect(page.getByRole('heading', { name: 'CSM loop', level: 1 })).toBeVisible();
    await expect(page.getByText(/of your insights landed this week/)).toBeVisible();
    await expect(page.locator('[data-tour="loop.inbox"]')).toBeVisible();
    const note = page.locator('[data-tour="loop.note"]');
    await expect(note).toBeVisible();
    await expect(note.getByRole('button', { name: /copy note/i })).toBeVisible();
    await expect(page.getByText(/estimate/i).first()).toBeVisible();
  });

  test('opening a notification emits notification.opened and keeps it in the URL', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/loop');
    const items = page.locator('[data-tour="loop.inbox"] li button');
    await expect(items.first()).toBeVisible();
    await items.nth(1).click();
    await expect.poll(async () => (await events()).filter((e) => e.name === 'notification.opened').length).toBe(1);
    await expect(page).toHaveURL(/[?&]n=/);
  });

  test('kind filter and CSM selector live in the URL', async ({ page }) => {
    await gotoApp(page, '/app/loop');
    await page.getByRole('radio', { name: /^Shipped/ }).click();
    await expect(page).toHaveURL(/kind=shipped/);
    await page.getByLabel('Choose a CSM').selectOption({ index: 1 });
    await expect(page).toHaveURL(/csm=ppl_/);
  });
});
