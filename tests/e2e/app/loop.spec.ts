import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Close the loop', () => {
  test('shows the stats, the inbox and the drafted customer note', async ({ page }) => {
    await gotoApp(page, '/app/loop');
    await expect(page.getByRole('heading', { name: 'Close the loop', level: 1 })).toBeVisible();
    await expect(page.getByText('Reached an owner')).toBeVisible();
    await expect(page.getByText(/estimate/i).first()).toBeVisible();
    await expect(page.locator('[data-tour="loop.inbox"]')).toBeVisible();
    // The newest shipped update carries the walkthrough anchor and is open by default.
    await expect(page.locator('[data-tour="loop.shipped"]')).toBeVisible();
    await expect(page.locator('[data-tour="loop.shipped"] button')).toHaveAttribute('aria-current', 'true');
    const note = page.locator('[data-tour="loop.note"]');
    await expect(note).toBeVisible();
    await expect(note.getByRole('textbox', { name: 'Draft note to the customer' })).toHaveValue(/\S/);
    await expect(note.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(note.getByRole('button', { name: 'Send from Gmail' })).toBeVisible();
  });

  test('the note is editable, and Send from Gmail is a simulated draft', async ({ page }) => {
    await gotoApp(page, '/app/loop');
    const box = page.locator('[data-tour="loop.note"]').getByRole('textbox');
    await box.fill('Hi Tasha, it shipped. Marcus');
    await expect(page.getByRole('button', { name: 'Undo my edits' })).toBeVisible();
    await page.getByRole('button', { name: 'Send from Gmail' }).click();
    await expect(page.getByText('Draft saved to Gmail')).toBeVisible();
    await expect(page.getByText(/Simulated/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo my edits' }).click();
    await expect(box).not.toHaveValue('Hi Tasha, it shipped. Marcus');
  });

  test('opening a notification emits notification.opened and keeps it in the URL', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/loop');
    const items = page.locator('[data-tour="loop.inbox"] li button');
    await expect(items.first()).toBeVisible();
    await items.nth(1).click();
    await expect.poll(async () => (await events()).filter((e) => e.name === 'notification.opened').length).toBe(1);
    await expect(page).toHaveURL(/[?&]n=/);
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'true');
  });

  test('kind filter and person filter live in the URL', async ({ page }) => {
    await gotoApp(page, '/app/loop');
    // Acting as the workspace admin (not a CSM), the filter starts on every CSM.
    await expect(page.getByLabel('Choose a CSM')).toHaveValue('all');
    await page
      .getByRole('group', { name: 'Filter updates' })
      .getByRole('button', { name: /^Shipped/ })
      .click();
    await expect(page).toHaveURL(/kind=shipped/);
    await page.getByLabel('Choose a CSM').selectOption({ index: 1 });
    await expect(page).toHaveURL(/csm=ppl_/);
  });

  test('defaults to the acting user when they are a CSM', async ({ page }) => {
    await gotoApp(page, '/app/settings');
    await page.locator('.ds-user').click();
    await page.getByRole('menuitem', { name: /Marcus Bell/ }).click();
    await expect(page.getByText('You’re now acting as Marcus Bell')).toBeVisible();
    await page.getByRole('link', { name: 'Close the loop' }).click();
    await expect(page.getByLabel('Choose a CSM')).toHaveValue('ppl_marcus');
    await expect(page.getByLabel('Choose a CSM').locator('option:checked')).toHaveText('Marcus Bell (you)');
  });
});
