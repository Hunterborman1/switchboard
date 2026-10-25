import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('Health & cost', () => {
  test('budget gauge, ledger and tables render', async ({ page }) => {
    await gotoApp(page, '/app/health');
    const budget = page.locator('[data-tour="health.budget"]');
    await expect(budget).toBeVisible();
    await expect(budget).toContainText(/Live AI budget: \$[\d.]+ of \$15\.00 used/);
    await expect(page.getByTestId('ladder-gauge')).toBeVisible();
    await expect(page.getByTestId('daily-spend-field')).toBeVisible();
    await expect(page.locator('#dlq [data-testid="data-table-row"]').first()).toBeVisible();
    await expect(page.locator('#recent-calls [data-testid="data-table-row"]').first()).toBeVisible();
  });

  test('a day with no ledger rows is a gap, never $0', async ({ page }) => {
    await gotoApp(page, '/app/health');
    const missing = page.locator('[data-testid="daily-column"][data-state="missing"]');
    if ((await missing.count()) > 0) await expect(missing.first()).toHaveAttribute('title', /not \$0/);
  });

  test('deep links into Agent Ops', async ({ page }) => {
    await gotoApp(page, '/app/health');
    await expect(page.getByRole('link', { name: /View logs & traces in Agent Ops/ })).toHaveAttribute('href', /\/ops\/logs\?agentId=agt_signal_loop/);
    await expect(page.locator('#recent-calls').getByRole('link', { name: 'Trace' }).first()).toHaveAttribute('href', /\/ops\/traces\//);
  });
});
