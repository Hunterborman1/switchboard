import { expect, test } from '@playwright/test';
import { anchor, open, signIn } from './helpers';

test('reliability: SLO cards with error budgets, charts, models, agent switch', async ({ page, context }) => {
  await signIn(context);
  await open(page, '/ops/reliability');
  const slos = anchor(page, 'ops.slos').first();
  await expect(slos.locator('[data-slo]')).toHaveCount(5);
  await expect(slos.locator('[data-slo="run_success"]')).toContainText('At risk');
  await expect(slos.getByText('Error budget left').first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Models' })).toContainText('deepseek/deepseek-v4.1-flash');
  await page.getByLabel('Agent', { exact: true }).selectOption('all');
  await expect(page).toHaveURL(/agentId=all/);
  await expect(anchor(page, 'ops.slos').first().locator('[data-slo]')).toHaveCount(9);
});

test('alerts: acknowledge is not resolve, and stays in the viewer’s workspace', async ({ page, context }) => {
  await signIn(context, `ws_${Date.now().toString(16).padStart(16, 'a').slice(-16)}`);
  await open(page, '/ops/reliability?agentId=agt_rfp_responder');
  const alert = anchor(page, 'ops.alerts').locator('[data-alert="alr_hist_rfp_library"]');
  await expect(alert).toHaveAttribute('data-status', 'open');
  await alert.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(alert).toHaveAttribute('data-status', 'acknowledged');
  await expect(alert).toContainText('resolves when the rule stops firing');
});
