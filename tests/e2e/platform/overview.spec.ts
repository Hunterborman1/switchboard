import { expect, test } from '@playwright/test';
import { anchor, noHorizontalScroll, open, signIn } from './helpers';

test.beforeEach(async ({ context }) => signIn(context));

test('overview: KPIs, weekly chart, needs attention, impact table', async ({ page }) => {
  await open(page, '/ops');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What our AI agents return');
  const kpis = anchor(page, 'ops.overview.kpis');
  for (const label of ['In production', 'Hours returned', 'Value', 'AI cost', 'ROI multiple', 'Weekly active']) await expect(kpis).toContainText(label);
  await expect(page.getByText('Estimates, not billing data.').first()).toBeVisible();
  await expect(page.locator('.ao-simmark')).toContainText('Simulated org data · 6 weeks');
  await expect(anchor(page, 'ops.overview.chart').locator('.recharts-bar-rectangle').first()).toBeVisible();
  const att = anchor(page, 'ops.overview.attention');
  await expect(att).toContainText('eval suite with promotion gate');
  await expect(att).toContainText('Answer library sync');
  await expect(page.getByRole('table', { name: 'Impact by agent' }).getByRole('row')).toHaveCount(4); // header + 2 agents + total
  await noHorizontalScroll(page);
});

test('overview: funnel tile filters the table and syncs to the URL', async ({ page }) => {
  await open(page, '/ops');
  await page.getByRole('group', { name: 'Agent work funnel' }).getByRole('button', { name: /Ran automatically/ }).click();
  await expect(page).toHaveURL(/stage=automatic/);
  await expect(page.getByRole('table', { name: 'Impact by agent' }).getByRole('columnheader', { name: /Ran automatically/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear stage filter' }).click();
  await expect(page).not.toHaveURL(/stage=/);
});

test('overview: needs-attention items link to their evidence', async ({ page }) => {
  await open(page, '/ops');
  await anchor(page, 'ops.overview.attention').getByRole('link', { name: /eval suite/ }).click();
  await expect(page).toHaveURL(/\/ops\/agents\/agt_rfp_responder#standard/);
  await expect(anchor(page, 'ops.agent.standard')).toBeVisible();
});

test('assumptions: a workspace override changes value, then resets', async ({ page }) => {
  await open(page, '/ops');
  await page.getByRole('button', { name: 'Assumptions' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Impact assumptions' });
  await expect(dialog).toContainText('2-week time study');
  await dialog.getByLabel('Loaded hourly cost (USD)').fill('170');
  await dialog.getByRole('button', { name: 'Save for my workspace' }).click();
  await expect(dialog).toContainText('Your workspace override is active.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(anchor(page, 'ops.overview.kpis')).toContainText('$170/h');
  await page.getByRole('button', { name: 'Assumptions' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Reset to \$85/ }).click();
  await page.keyboard.press('Escape');
  await expect(anchor(page, 'ops.overview.kpis')).toContainText('$85/h');
});

test('executive summary reads as templated sentences and is printable', async ({ page }) => {
  await open(page, '/ops');
  await page.getByRole('link', { name: 'Executive summary' }).click();
  await expect(page).toHaveURL(/\/ops\/summary/);
  const p = page.getByTestId('exec-summary').locator('p');
  await expect(p.first()).toContainText('production agents returned an estimated');
  expect(await p.count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
});
