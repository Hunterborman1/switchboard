import { expect, test } from '@playwright/test';
import { anchor, open, signIn } from './helpers';

test.beforeEach(async ({ context }) => signIn(context));

test('registry lists both agents with owner, status, review and standard score', async ({ page }) => {
  await open(page, '/ops/agents');
  const table = anchor(page, 'ops.registry');
  await expect(table.getByRole('row')).toHaveCount(3);
  const sl = anchor(page, 'ops.registry.signal');
  await expect(sl).toContainText('Signal Loop');
  await expect(sl).toContainText('Hunter Borman');
  await expect(sl).toContainText('Production');
  await expect(sl.getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/repo/invoca/app');
  const rfp = table.locator('[data-agent="agt_rfp_responder"]');
  await expect(rfp).toContainText('Gumloop');
  await expect(rfp).toContainText('Due soon');
  await expect(rfp).toContainText('8/9');
});

test('agent page: ownership + review, standard with evidence, SLOs, changelog', async ({ page }) => {
  await open(page, '/ops/agents');
  await anchor(page, 'ops.registry.signal').getByRole('link', { name: 'Signal Loop' }).click();
  await expect(page).toHaveURL(/agt_signal_loop/);
  const review = anchor(page, 'ops.agent.review');
  await expect(review).toContainText('Elena Vasquez');
  await expect(review).toContainText('Every 30 days');
  const std = anchor(page, 'ops.agent.standard');
  await expect(std.locator('[data-check]')).toHaveCount(9);
  await expect(std.locator('[data-check="evals"]')).toContainText('promotion gate');
  await expect(page.locator('[data-slo="run_success"]').first()).toHaveAttribute('data-status', 'at_risk');
  await expect(page.getByText('Primary model 503s; automatic fallback')).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Signal Loop/ }).first()).toBeVisible();
});

test('unknown agent shows an empty state', async ({ page }) => {
  await page.goto('/repo/invoca/ops/agents/agt_missing');
  await expect(page.getByText('No agent with that id')).toBeVisible();
});
