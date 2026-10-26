import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

/**
 * Switchboard platform pages (fixture mode): overview, connections, people and the analyses
 * catalog. Connectors are simulated, but connecting and disconnecting must change state.
 */
test.describe('Switchboard platform', () => {
  test('overview shows what came in, where it went, and what needs a person', async ({ page }) => {
    await gotoApp(page, '/app/overview');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Conversations', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What came in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Where results went' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs a person' })).toBeVisible();
  });

  test('connect a tool through the authorize dialog, then disconnect it', async ({ page }) => {
    await gotoApp(page, '/app/connections');
    const salesforce = page.locator('article', { has: page.getByRole('link', { name: 'Salesforce' }) });
    await expect(salesforce).toContainText('Not connected');
    await salesforce.getByRole('button', { name: 'Connect' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Connect Salesforce');
    await expect(dialog).toContainText('Switchboard will be able to:');
    await dialog.getByRole('button', { name: 'Authorize and connect' }).click();
    await expect(page.getByText('Salesforce connected')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.locator('article', { has: page.getByRole('link', { name: 'Salesforce' }) })).toContainText('invoca.my.salesforce.com');

    await page.getByRole('link', { name: 'Salesforce' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Salesforce');
    await page.getByRole('button', { name: 'Disconnect' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Salesforce disconnected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect Salesforce' })).toBeVisible();
  });

  test('send a test message through a connected tool', async ({ page }) => {
    await gotoApp(page, '/app/connections/slack');
    await page.getByRole('button', { name: 'Send a test' }).click();
    await expect(page.getByText('Test sent to Slack')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Slack activity' })).toContainText('Test message');
  });

  test('add a person with tool handles, then remove them', async ({ page }) => {
    await gotoApp(page, '/app/people');
    await page.getByRole('button', { name: 'Add person' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel('Name').fill('Taylor Brooks');
    await drawer.getByLabel('Title').fill('PM, Integrations');
    await drawer.getByLabel('Role').selectOption('pm');
    await drawer.getByLabel('Work email').fill('taylor.brooks@invoca.example');
    await drawer.getByLabel('Slack').fill('@taylor');
    await drawer.getByLabel('Jira').fill('tbrooks');
    await drawer.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByText('Taylor Brooks added')).toBeVisible();

    const row = page.getByRole('row', { name: /Taylor Brooks/ });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Actions for Taylor Brooks' }).click();
    await page.getByRole('menuitem', { name: 'Remove from workspace' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Taylor Brooks removed')).toBeVisible();
    await expect(page.getByRole('row', { name: /Taylor Brooks/ })).toHaveCount(0);
    await page.getByText('Show removed').click();
    await expect(page.getByRole('row', { name: /Taylor Brooks/ })).toContainText('Removed');
  });

  test('act as another person from the user menu', async ({ page }) => {
    await gotoApp(page, '/app/people');
    const name = 'Nina Patel';
    const row = page.getByRole('row', { name: /Nina Patel/ });
    await row.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Act as this person' }).click();
    await expect(page.getByText(`You’re now acting as ${name}`)).toBeVisible();
    await expect(page.locator('.ds-user__name')).toHaveText(name);
  });

  test('analyses catalog marks Signal Loop as running and the rest as not built', async ({ page }) => {
    await gotoApp(page, '/app/analyses');
    await expect(page.getByRole('heading', { name: 'Signal Loop' })).toBeVisible();
    await expect(page.getByText('Running')).toBeVisible();
    await expect(page.getByText('Not built')).toHaveCount(5);
  });
});
