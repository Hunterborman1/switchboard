import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('New call + file picker', () => {
  test('picker opens from Upload, lists folders, previews, and opens a file', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/new');
    await page.click('[data-tour="new.upload"]');
    const dialog = page.locator('[data-tour="picker.dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-tour="picker.folder"]')).toContainText('Calls');
    // no walkthrough marker outside the tour
    await expect(page.getByText('Suggested for the walkthrough')).toHaveCount(0);
    await page.click('[data-tour="picker.recommended"]');
    await expect(page.locator('[data-tour="picker.preview"]')).toContainText('First lines');
    await page.click('[data-tour="picker.open"]');
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Complexity revealed|Edge case revealed/)).toBeVisible();
    await expect(page.locator('[data-tour="new.run"]')).toBeEnabled();
    const names = (await events()).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['picker.opened', 'file.selected', 'picker.closed']));
  });

  test('suggested marker appears only while the tour is active', async ({ page }) => {
    await gotoApp(page, '/app/new', { tour: true });
    await page.click('[data-tour="new.upload"]');
    await expect(page.getByText('Suggested for the walkthrough')).toBeVisible();
  });

  test('Esc cancels and the Open button explains why it is disabled', async ({ page }) => {
    await gotoApp(page, '/app/new');
    await page.click('[data-tour="new.upload"]');
    await expect(page.locator('[data-tour="picker.open"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-tour="picker.dialog"]')).toBeHidden();
  });

  test('keyboard: arrow keys select and Enter opens', async ({ page }) => {
    await gotoApp(page, '/app/new');
    await page.click('[data-tour="new.upload"]');
    await page.getByRole('listbox').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-tour="picker.dialog"]')).toBeHidden();
  });

  test('paste text enforces the 40 character minimum', async ({ page }) => {
    await gotoApp(page, '/app/new');
    await page.getByRole('tab', { name: /Paste text/ }).click();
    await page.fill('#paste-text', 'too short');
    await expect(page.locator('[data-tour="new.run"]')).toBeDisabled();
    await expect(page.getByText(/at least 40 characters/)).toBeVisible();
  });

  test('pressing Run on a file already run offers the earlier run or a fresh live run', async ({ page }) => {
    await gotoApp(page, '/app/new');
    const pick = async () => {
      await page.click('[data-tour="new.upload"]');
      await page.click('[data-tour="picker.recommended"]');
      await page.click('[data-tour="picker.open"]');
    };
    await pick();
    await page.click('[data-tour="new.run"]');
    await expect(page).toHaveURL(/\/app\/runs\/run_/);
    const first = page.url().match(/runs\/(run_[^?#/]+)/)![1]!;

    await gotoApp(page, '/app/new');
    await pick();
    await page.click('[data-tour="new.run"]');
    const choice = page.getByTestId('earlier-run-choice');
    await expect(choice).toContainText('You already ran this file');
    await choice.getByRole('button', { name: 'Open your earlier run' }).click();
    await expect(page).toHaveURL(new RegExp(`runs/${first}[?]earlier=1`));
    await expect(page.getByText('Your earlier run, replayed from its saved steps')).toBeVisible();
    await expect(page.getByText(/Earlier (live )?run/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Run again live' }).click();
    await expect(page).not.toHaveURL(new RegExp(first));
    await expect(page).toHaveURL(/\/app\/runs\/run_/);
    await expect(page.getByText('Your earlier run, replayed from its saved steps')).toHaveCount(0);
  });
});
