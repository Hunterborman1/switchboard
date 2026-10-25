import { expect, test } from '@playwright/test';
import { anchor, open, signIn } from './helpers';

test.beforeEach(async ({ context }) => signIn(context));

test('logs: URL-synced filters, row drawer, trace waterfall with span detail', async ({ page }) => {
  await open(page, '/ops/logs?agentId=agt_signal_loop');
  const table = anchor(page, 'ops.logs');
  await expect(table.locator('tbody tr').first()).toBeVisible();
  // Routine web requests are hidden by default; the toggle brings them back via the URL.
  const web = page.getByLabel('Include web requests');
  await expect(web).not.toBeChecked();
  await web.click();
  await expect(page).toHaveURL(/web=1/);
  await expect(web).toBeChecked();
  await web.click();
  await expect(page).not.toHaveURL(/web=1/);
  await expect(web).not.toBeChecked();
  await page.getByRole('group', { name: 'Levels' }).getByRole('button', { name: 'debug' }).click();
  await expect(page).toHaveURL(/level=/);
  await page.getByLabel('Search message, event, trace or run id').fill('fall');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=fall/);
  const row = table.locator('tbody tr').first();
  await expect(row).toContainText(/fall/i);
  await row.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Trace id');
  await drawer.getByRole('link', { name: 'Open trace' }).click();
  await expect(page).toHaveURL(/\/ops\/traces\//);
  const wf = anchor(page, 'ops.trace.waterfall');
  await expect(wf.locator('[data-kind="ai"]').first()).toBeVisible();
  await wf.locator('[data-kind="ai"]').first().click();
  await expect(page.getByRole('heading', { name: 'Attributes' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Correlated logs' })).toBeVisible();
});

test('logs: "Your last run" opens the viewer’s live trace or explains how to make one', async ({ page }) => {
  await open(page, '/ops/logs');
  await anchor(page, 'ops.logs.trace').click();
  await expect(page.getByText(/No live Signal Loop run yet|Your latest Signal Loop run|Latest live Signal Loop run/)).toBeVisible();
});

test('trace: unknown id shows an empty state', async ({ page }) => {
  await page.goto('/repo/invoca/ops/traces/0000deadbeef0000');
  await expect(page.getByText('No trace with that id')).toBeVisible();
});
