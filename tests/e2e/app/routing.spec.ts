import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Routing', () => {
  test('editing the pricing rule saves an override and emits rule.changed', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/routing');
    await expect(page.locator('[data-tour="routing.rules"]')).toBeVisible();
    await expect(page.locator('[data-tour="routing.sankey"]')).toBeVisible();
    const row = page.locator('[data-tour="routing.rule.pricing"]');
    await expect(row).toBeVisible();
    const owner = row.locator('select').first();
    const options = await owner.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const current = await owner.inputValue();
    await owner.selectOption(options.find((v) => v && v !== current)!);
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Override saved in your workspace')).toBeVisible();
    await expect.poll(async () => (await events()).some((e) => e.name === 'rule.changed')).toBe(true);
    await expect(row.getByText('Your override')).toBeVisible();
  });

  test('delivery log rows expand into an attempt timeline', async ({ page }) => {
    await gotoApp(page, '/app/routing');
    const log = page.locator('[data-tour="routing.deliveries"]');
    await expect(log).toBeVisible();
    await log.getByRole('button', { name: /Show attempts/ }).first().click();
    await expect(log.getByTestId('delivery-timeline')).toBeVisible();
  });
});
