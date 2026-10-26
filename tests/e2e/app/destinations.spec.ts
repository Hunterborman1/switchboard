import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Deliveries', () => {
  test('previews render and the ticket moves to Shipped', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/destinations');
    const jira = page.locator('[data-tour="dest.jira"]');
    await expect(jira).toBeVisible();
    const state = page.locator('[data-tour="ticket.state"]');
    const target = (await state.getByRole('button', { name: 'Open' }).getAttribute('aria-pressed')) === 'true' ? 'In progress' : 'Open';
    await state.getByRole('button', { name: target }).click();
    await expect(state.getByRole('button', { name: target })).toHaveAttribute('aria-pressed', 'true');
    await state.getByRole('button', { name: 'Shipped' }).click();
    await expect(state.getByRole('button', { name: 'Shipped' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await events()).filter((e) => e.name === 'ticket.state').length).toBeGreaterThanOrEqual(2);

    await page.getByRole('tab', { name: /Chat/ }).click();
    await expect(page).toHaveURL(/kind=chat/);
    await expect(page.locator('[data-tour="dest.slack"]')).toContainText('Signal Loop');
  });

  test('picking a delivery emits delivery.opened', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/destinations');
    const list = page.getByRole('list', { name: /Issue deliveries/ });
    await list.getByRole('button').nth(1).click();
    await expect.poll(async () => (await events()).some((e) => e.name === 'delivery.opened')).toBe(true);
    await expect(page).toHaveURL(/d=/);
  });

  test('the walkthrough step in the URL opens the tab it spotlights', async ({ page }) => {
    await gotoApp(page, '/app/destinations?tour=ch4.slack');
    await expect(page.locator('[data-tour="dest.slack"]')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Chat/ })).toHaveAttribute('aria-selected', 'true');
  });
});
