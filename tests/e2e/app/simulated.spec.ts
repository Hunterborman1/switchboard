import { expect, test, type Locator } from '@playwright/test';
import { gotoApp } from './helpers';

/**
 * Anything not fully built says Simulated (one outline badge per context, with what and why on
 * hover). Inputs, the AI and the content of every delivery are real; the connections are not.
 */
const simulated = (scope: Locator) => scope.locator('[data-simulated]').getByText('Simulated', { exact: true });

test.describe('Simulated labels', () => {
  test('connections: the catalog, a connection page and the authorize dialog', async ({ page }) => {
    await gotoApp(page, '/app/connections');
    await expect(simulated(page.locator('.ds-page-header'))).toBeVisible();

    await gotoApp(page, '/app/connections/slack');
    await expect(simulated(page.locator('.ds-page-header'))).toBeVisible();

    await gotoApp(page, '/app/connections');
    const salesforce = page.locator('article', { has: page.getByRole('link', { name: 'Salesforce' }) });
    await salesforce.getByRole('button', { name: 'Connect' }).click();
    await expect(simulated(page.getByRole('dialog'))).toBeVisible();
  });

  test('deliveries: the page, each preview frame, and the status say simulated', async ({ page }) => {
    await gotoApp(page, '/app/destinations');
    await expect(simulated(page.locator('.ds-page-header'))).toBeVisible();
    const frame = page.locator('[data-tour="dest.jira"]');
    await expect(simulated(frame.locator('header'))).toBeVisible();
    await expect(page.getByText('Delivered (simulated)', { exact: true })).toBeVisible();
  });

  test('a hover says what is simulated and why', async ({ page }) => {
    await gotoApp(page, '/app/destinations');
    await simulated(page.locator('.ds-page-header')).hover();
    await expect(page.getByRole('tooltip')).toContainText('No real accounts in this demo');
  });

  test('routing labels the channel column and the disconnected-tool warning', async ({ page }) => {
    await gotoApp(page, '/app/routing');
    await expect(simulated(page.getByRole('columnheader', { name: /Channel/ }))).toBeVisible();
    const row = page.locator('[data-tour="routing.rule.pricing"]');
    await row.getByLabel(/^Channel for/).selectOption('salesforce');
    await expect(page.getByText('Salesforce isn’t connected (simulated), so matches go to triage.')).toBeVisible();
  });

  test('overview, new conversation, close the loop and people', async ({ page }) => {
    await gotoApp(page, '/app/overview');
    for (const title of ['Where it came from', 'Where results went']) {
      await expect(simulated(page.locator('section.ds-card', { has: page.getByRole('heading', { name: title }) }))).toBeVisible();
    }

    await gotoApp(page, '/app/new');
    await expect(simulated(page.locator('#via-panel'))).toBeVisible();
    await expect(page.locator('#via-panel')).toContainText('sample calls');

    await gotoApp(page, '/app/loop');
    await expect(simulated(page.locator('[data-tour="loop.note"]'))).toBeVisible();

    await gotoApp(page, '/app/people');
    await expect(simulated(page.locator('.ds-page-header'))).toBeVisible();
    await expect(page.locator('.ds-page-header')).toContainText('fictional people');
  });

  test('analyses: Signal Loop is built and running, the rest are not built', async ({ page }) => {
    await gotoApp(page, '/app/analyses');
    await expect(page.getByText('Built and running', { exact: true })).toBeVisible();
    await expect(page.getByText('Not built', { exact: true })).toHaveCount(5);
  });
});
