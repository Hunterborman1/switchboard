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
    const owner = row.getByLabel(/^Owner for/);
    const options = await owner.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const current = await owner.inputValue();
    await owner.selectOption(options.find((v) => v && v !== current)!);
    await expect(page.getByText(/^\d+ unsaved$/)).toBeVisible();
    await row.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Override saved in your workspace')).toBeVisible();
    await expect.poll(async () => (await events()).some((e) => e.name === 'rule.changed')).toBe(true);
    await expect(row.getByText('Your override')).toBeVisible();
    await expect(row.getByRole('status')).toHaveText('Saved');
    await expect(row).toHaveAttribute('data-override', 'true');
  });

  test('a channel whose tool is not connected warns that matches go to triage', async ({ page }) => {
    await gotoApp(page, '/app/routing');
    const row = page.locator('[data-tour="routing.rule.pricing"]');
    await row.getByLabel(/^Channel for/).selectOption('salesforce');
    const warning = page.getByText('Salesforce isn’t connected (simulated), so matches go to triage.');
    await expect(warning).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connect Salesforce' })).toHaveAttribute('href', /connections\/salesforce/);
    await row.getByRole('button', { name: 'Reset' }).click();
    await expect(warning).toHaveCount(0);
  });

  test('delivery log rows expand into their attempts', async ({ page }) => {
    await gotoApp(page, '/app/routing');
    const log = page.locator('[data-tour="routing.deliveries"]');
    await expect(log).toBeVisible();
    const toggle = log.getByRole('button', { name: /Show attempts/ }).first();
    await toggle.click();
    await expect(log.getByTestId('delivery-timeline')).toBeVisible();
    await expect(log.getByTestId('delivery-timeline')).toContainText('Attempt 1');
    await log.getByRole('button', { name: /Hide attempts/ }).first().click();
    await expect(log.getByTestId('delivery-timeline')).toHaveCount(0);
  });
});
