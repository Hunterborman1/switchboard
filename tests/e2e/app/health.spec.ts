import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('Usage and health', () => {
  test('budget, daily chart and tables render', async ({ page }) => {
    await gotoApp(page, '/app/health');
    await expect(page.getByRole('heading', { name: 'Usage and health', level: 1 })).toBeVisible();
    const budget = page.locator('[data-tour="health.budget"]');
    await expect(budget).toBeVisible();
    await expect(budget).toContainText(/\$[\d.]+\s*of \$15\.00 used/);
    await expect(budget.getByRole('meter')).toBeVisible();
    await expect(budget).toContainText(/switches off|replay/i);
    await expect(page.locator('[data-testid="daily-column"]').first()).toBeVisible();
    await expect(page.locator('#dlq tbody tr').first()).toBeVisible();
    await expect(page.locator('#recent-calls tbody tr').first()).toBeVisible();
  });

  test('the chart switches metric and has a table view', async ({ page }) => {
    await gotoApp(page, '/app/health');
    const metrics = page.getByRole('group', { name: 'Chart metric' });
    await metrics.getByRole('button', { name: 'Response time' }).click();
    await expect(page.getByText('Slowest 5% of calls')).toBeVisible();
    await page.getByRole('button', { name: 'Show table' }).click();
    await expect(page.getByRole('table', { name: 'Daily usage' })).toBeVisible();
  });

  test('a day with nothing recorded is a gap, never $0', async ({ page }) => {
    await gotoApp(page, '/app/health');
    const missing = page.locator('[data-testid="daily-column"][data-state="missing"]');
    if ((await missing.count()) > 0) {
      await expect(missing.first()).toHaveAttribute('aria-label', /not \$0/);
      await page.getByRole('button', { name: 'Show table' }).click();
      await expect(page.getByRole('table', { name: 'Daily usage' })).toContainText('Nothing recorded');
    }
  });

  test('failures read in plain English', async ({ page }) => {
    await gotoApp(page, '/app/health');
    const dlq = page.locator('#dlq');
    await expect(dlq).toContainText('The AI’s answer was incomplete');
    await expect(dlq).not.toContainText('Schema validation');
  });

  test('deep links into Agent Ops', async ({ page }) => {
    await gotoApp(page, '/app/health');
    await expect(page.getByRole('link', { name: 'View logs in Agent Ops' })).toHaveAttribute('href', /\/ops\/logs\?agentId=agt_signal_loop/);
    await expect(page.locator('#recent-calls').getByRole('link', { name: 'Trace' }).first()).toHaveAttribute('href', /\/ops\/traces\//);
  });
});
