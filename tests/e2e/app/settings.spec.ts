import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers';

test.describe('Settings', () => {
  test('shows models, thresholds and the workspace note', async ({ page }) => {
    await gotoApp(page, '/app/settings');
    await expect(page.getByText('Viewer changes stay in your workspace')).toBeVisible();
    await expect(page.getByText('Primary · fast tier')).toBeVisible();
    await expect(page.getByText('≥ 0.80').first()).toBeVisible();
    await expect(page.getByText('≥ 0.90').first()).toBeVisible();
  });

  test('reset asks for confirmation, then resets', async ({ page }) => {
    await gotoApp(page, '/app/settings');
    await page.getByRole('button', { name: 'Reset my workspace' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Reset your workspace?');
    await dialog.getByRole('button', { name: 'Reset workspace' }).click();
    await expect(page.getByText('Workspace reset')).toBeVisible();
    await expect(dialog).toBeHidden();
  });
});
