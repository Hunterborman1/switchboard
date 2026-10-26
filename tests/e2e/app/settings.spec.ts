import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('Settings', () => {
  test('shows the workspace, models, thresholds and data handling', async ({ page }) => {
    await gotoApp(page, '/app/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByText('Everything you change here is saved to your own private workspace')).toBeVisible();
    await expect(page.getByText('ws_dev_fixtures')).toBeVisible();
    // Settings is the one place the exact model ids are shown, by role.
    const models = page.locator('section.ds-card', { has: page.getByRole('heading', { name: 'Models' }) });
    await expect(models).toBeVisible();
    await expect(models.getByText('Decision model', { exact: true })).toBeVisible();
    await expect(models.getByText('Main model', { exact: true })).toBeVisible();
    await expect(models.getByText('Backup model', { exact: true })).toBeVisible();
    await expect(models).toContainText('deepseek/deepseek-v4.1-flash');
    await expect(models).toContainText('anthropic/claude-haiku-5.5');
    // The fixture session has no decision model configured.
    await expect(models).toContainText('Not configured');
    await expect(page.getByText('≥ 0.80').first()).toBeVisible();
    await expect(page.getByText('≥ 0.55').first()).toBeVisible();
    await expect(page.getByText('≥ 0.90').first()).toBeVisible();
    await expect(page.getByText('Provider data collection')).toBeVisible();
  });

  test('reset asks for confirmation, then resets', async ({ page }) => {
    await gotoApp(page, '/app/settings');
    await page.getByRole('button', { name: 'Reset workspace' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Reset this workspace?');
    await dialog.getByRole('button', { name: 'Reset workspace' }).click();
    await expect(page.getByText('Workspace reset')).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  test('cancel leaves the workspace alone', async ({ page }) => {
    await gotoApp(page, '/app/settings');
    await page.getByRole('button', { name: 'Reset workspace' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Workspace reset')).toHaveCount(0);
  });
});
