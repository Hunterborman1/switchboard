import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { captureEvents, gotoApp } from './helpers';

/** A small Word document, built here so the upload path runs on a real .docx. */
function docx(paragraphs: string[]): Buffer {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  return Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(xml) }));
}

test.describe('New conversation + library picker', () => {
  test('picker opens from the connected-source tab, lists folders, previews, and opens a file', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/new');
    await expect(page.locator('[data-tour="new.run"]')).toBeDisabled();
    await expect(page.getByText('Choose a conversation to continue')).toBeVisible();
    await page.click('[data-tour="new.upload"]');
    const dialog = page.locator('[data-tour="picker.dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-tour="picker.folder"]')).toContainText('Calls');
    // each file says which connected tool it came from
    await expect(page.locator('[data-tour="picker.recommended"]')).toContainText('Transcript from');
    // no walkthrough marker outside the tour
    await expect(page.getByText('Suggested for the walkthrough')).toHaveCount(0);
    await page.click('[data-tour="picker.recommended"]');
    await expect(page.locator('[data-tour="picker.preview"]')).toContainText('First lines');
    await page.click('[data-tour="picker.open"]');
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^(Complexity|Edge case)$/)).toBeVisible();
    await expect(page.locator('[data-tour="new.run"]')).toBeEnabled();
    await expect(page.getByText('Runs live on the AI models in about 3 seconds')).toBeVisible();
    const names = (await events()).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['picker.opened', 'file.selected', 'picker.closed']));
  });

  test('suggested marker appears only while the tour is active', async ({ page }) => {
    await gotoApp(page, '/app/new', { tour: true });
    await page.click('[data-tour="new.upload"]');
    await expect(page.getByText('Suggested for the walkthrough')).toBeVisible();
  });

  test('Esc cancels and the Open button stays disabled until a file is selected', async ({ page }) => {
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

  test('search finds a file by call ID and says when nothing matches', async ({ page }) => {
    await gotoApp(page, '/app/new');
    await page.click('[data-tour="new.upload"]');
    const dialog = page.locator('[data-tour="picker.dialog"]');
    await dialog.getByPlaceholder(/search/i).fill('zzzz-nothing');
    await expect(dialog.getByText('No conversations match')).toBeVisible();
    await dialog.getByPlaceholder(/search/i).fill('C-1042');
    await expect(dialog.getByRole('option')).not.toHaveCount(0);
  });

  test('paste text enforces the 40 character minimum', async ({ page }) => {
    await gotoApp(page, '/app/new');
    await page.getByRole('tab', { name: /Paste text/ }).click();
    await page.fill('#paste-text', 'too short');
    await expect(page.locator('[data-tour="new.run"]')).toBeDisabled();
    await expect(page.getByText(/at least 40 characters/)).toBeVisible();
    await page.fill('#paste-text', 'Dana: the CSV export times out on anything over thirty days, every time we try.');
    await expect(page.locator('[data-tour="new.run"]')).toBeEnabled();
  });

  test('upload: a Word file is converted in the browser and processed', async ({ page }) => {
    await gotoApp(page, '/app/new?via=upload');
    await expect(page.getByRole('tab', { name: /Upload a file/ })).toHaveAttribute('aria-selected', 'true');
    await page.setInputFiles('input[type=file]', {
      name: 'Northwind renewal prep.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docx(['Lena said the AI agent hands calls over without the reason for the call.', 'Customers repeat themselves on every transfer.']),
    });
    await expect(page.getByText('Word document')).toBeVisible();
    await expect(page.getByText('Customers repeat themselves on every transfer.')).toBeVisible();
    await page.click('[data-tour="new.run"]');
    await expect(page).toHaveURL(/\/app\/runs\/run_/);
  });

  test('upload: audio and empty files explain what to do instead', async ({ page }) => {
    await gotoApp(page, '/app/new?via=upload');
    await page.setInputFiles('input[type=file]', { name: 'call.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from([0x49, 0x44, 0x33, 3, 0]) });
    await expect(page.getByText('Audio and video need a transcript')).toBeVisible();
    await expect(page.getByText(/Connect Gong or Zoom, or upload the transcript file/)).toBeVisible();
    await expect(page.locator('[data-tour="new.run"]')).toBeDisabled();
    await page.setInputFiles('input[type=file]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('') });
    await expect(page.getByText('This file is empty')).toBeVisible();
  });

  test('pressing Process on a file already run offers the earlier run or a fresh live run', async ({ page }) => {
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
    // the Run view says it is the earlier run, not a new one (copy owned by RunView)
    await expect(page.getByText('Your earlier run of this file')).toBeVisible();

    await page.getByRole('button', { name: 'Run again live' }).click();
    await expect(page).not.toHaveURL(new RegExp(first));
    await expect(page).toHaveURL(/\/app\/runs\/run_/);
    await expect(page.getByText('Your earlier run of this file')).toHaveCount(0);
  });
});
