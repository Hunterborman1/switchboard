import { expect, test } from '@playwright/test';
import { anchor, open, signIn } from './helpers';

test.beforeEach(async ({ context }) => signIn(context));

test('cost: estimates callout, live $15 budget, per-agent and per-unit cost, spend trend', async ({ page }) => {
  await open(page, '/ops/cost');
  await expect(page.getByText('Estimates, not billing data.')).toBeVisible();
  await expect(page.getByText('Signal Loop live-AI budget')).toBeVisible();
  await expect(page.getByText('of $15.00 used')).toBeVisible();
  const table = anchor(page, 'ops.cost');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table).toContainText('per questionnaire drafted');
  await expect(page.getByRole('img', { name: 'Daily AI spend by agent' })).toBeVisible();
});

test('standard: matrix of agents × 9 checks, evidence on click', async ({ page }) => {
  await open(page, '/ops/standard');
  const matrix = page.getByRole('table', { name: 'Agent standard matrix' });
  await expect(matrix.locator('tbody tr')).toHaveCount(2);
  await expect(matrix.locator('.ao-mcell')).toHaveCount(18);
  await matrix.getByRole('button', { name: /Signal Loop: Eval suite with promotion gate: passes/ }).click();
  await expect(page.locator('.ao-evidence')).toContainText('promotion gate blocked prompt v5');
  // The simulated agent's gap reads in the open-gaps list; its cells are not selectable.
  await expect(page.getByText(/Spot-checks only/).first()).toBeVisible();
});

test('reviews calendar and the new-agent checklist', async ({ page }) => {
  await open(page, '/ops/standard/reviews');
  await expect(page.getByRole('table', { name: 'Scheduled reviews' }).locator('tbody tr').first()).toContainText('Due soon');
  await page.getByRole('link', { name: 'New agent checklist' }).click();
  await expect(page.locator('.ao-steps li')).toHaveCount(9);
});
