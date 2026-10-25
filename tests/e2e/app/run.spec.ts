import { expect, test, type Page } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

async function startRun(page: Page, fileId: string) {
  await gotoApp(page, '/app/new', { pace: 80 });
  await page.click('[data-tour="new.upload"]');
  await page.fill('input[type=search]', fileId.replace('file_', ''));
  await page.click(`[data-file="${fileId}"]`);
  await page.click('[data-tour="picker.open"]');
  await page.click('[data-tour="new.run"]');
  await expect(page).toHaveURL(/#\/app\/runs\/run_/);
}

test.describe('Run view', () => {
  test('main path: steps reveal, a quote is dropped, events fire in order', async ({ page }) => {
    const events = await captureEvents(page);
    await startRun(page, 'file_c1042');
    await expect(page.locator('[data-tour="run.stepper"]')).toBeVisible();
    await expect(page.locator('[data-step="deliver"]')).toHaveAttribute('data-status', 'passed', { timeout: 20_000 });
    await expect(page.locator('[data-tour="run.dropped"]')).toContainText('not found in the conversation');
    await expect(page.locator('[data-tour="run.gate"]')).toBeVisible();
    await expect(page.locator('[data-tour="run.trace"]')).toContainText('$0.00');
    const list = await events();
    const names = list.map((e) => e.name);
    expect(names).toContain('run.started');
    expect(names.filter((n) => n === 'run.step')).toHaveLength(10);
    expect(names.indexOf('run.finished')).toBeGreaterThan(names.lastIndexOf('run.step'));
  });

  test('evidence focus and redaction toggle emit events', async ({ page }) => {
    const events = await captureEvents(page);
    await startRun(page, 'file_c1042');
    await expect(page.locator('[data-step="deliver"]')).toHaveAttribute('data-status', 'passed', { timeout: 20_000 });
    await page.locator('[data-tour="run.insights"] button[aria-label^="Show this quote"]').first().click();
    await page.locator('[data-tour="run.redaction"]').getByRole('radio', { name: /Before/ }).click();
    const names = (await events()).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['evidence.focused', 'redaction.toggled']));
    // masked previews only, never raw originals
    await expect(page.locator('[data-tour="run.transcript"]')).not.toContainText('[PERSON_1]');
  });

  test('negative control shows a calm Nothing actionable state', async ({ page }) => {
    await startRun(page, 'file_prairielink_friendly');
    await expect(page.getByText('Nothing actionable').first()).toBeVisible({ timeout: 20_000 });
  });

  test('injection file shows the security callout with inert excerpt', async ({ page }) => {
    await startRun(page, 'file_bluewater_signature_injection');
    await expect(page.locator('[data-tour="run.screen"]')).toContainText('Prompt injection caught', { timeout: 20_000 });
  });
});
