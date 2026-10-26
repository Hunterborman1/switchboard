import { expect, test } from '@playwright/test';
import { anchor, open, signIn } from './helpers';

test('reliability: SLO cards with error budgets, charts, models, agent switch', async ({ page, context }) => {
  await signIn(context);
  await open(page, '/ops/reliability');
  const slos = anchor(page, 'ops.slos').first();
  await expect(slos.locator('[data-slo]')).toHaveCount(5);
  await expect(slos.locator('[data-slo="run_success"]')).toContainText('Meeting');
  await expect(slos.getByText('Error budget left').first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Models' })).toContainText('Main model');
  await expect(page.getByRole('table', { name: 'Models' })).not.toContainText('deepseek/');
  await page.getByLabel('Agent', { exact: true }).selectOption('all');
  await expect(page).toHaveURL(/agentId=all/);
  await expect(anchor(page, 'ops.slos').first().locator('[data-slo]')).toHaveCount(9);
});
// The only seeded open alert is on the simulated agent, which shows no actions (simulated.spec.ts);
// acknowledge-is-not-resolve per workspace is covered at the API in tests/worker/platform.
