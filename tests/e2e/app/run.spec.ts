import { expect, test, type Page } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

async function startRun(page: Page, fileId: string) {
  await gotoApp(page, '/app/new');
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
    // the Timing card: real step timestamps on one clock, totals, and the way into Agent Ops
    const timing = page.locator('[data-tour="run.timing"]');
    await expect(timing).toContainText('$0.00');
    await expect(timing).toContainText('Wall time');
    await expect(timing.locator('[data-timing-step]')).toHaveCount(10);
    await expect(timing.getByRole('link', { name: 'See every call in Agent Ops' })).toHaveAttribute('href', /\/ops\/traces\/run_/);
    // fixtures run triage, then extraction: only a run that overlapped them says so
    await expect(timing).not.toContainText('started with triage');
    await expect(page.locator('[data-tour="run.clock"]')).toContainText('Finished in');
    // the ten steps read in plain words, and the quote check carries its own anchor
    await expect(page.locator('[data-tour="run.stepper"]')).toContainText('Triage');
    await expect(page.locator('[data-tour="run.ground"]')).toContainText('Check quotes');
    const list = await events();
    const names = list.map((e) => e.name);
    expect(names).toContain('run.started');
    expect(names.filter((n) => n === 'run.step')).toHaveLength(10);
    expect(names.indexOf('run.finished')).toBeGreaterThan(names.lastIndexOf('run.step'));
  });

  test('the clock runs live from the real start, then shows the real total; replay plays back at recorded speed', async ({ page }) => {
    await startRun(page, 'file_c1042');
    const clock = page.locator('[data-tour="run.clock"]');
    await expect(clock).toHaveAttribute('data-state', 'running');
    await expect(clock).toContainText(/Running · \d+\.\d s/);
    // no Timing breakdown until the run has finished
    await expect(page.locator('[data-tour="run.timing"]')).toHaveCount(0);
    await expect(clock).toHaveAttribute('data-state', 'finished', { timeout: 20_000 });
    await expect(clock).toContainText(/Finished in [\d.]+ (ms|s)/);
    await expect(clock).toContainText('Live run');
    await expect(page.locator('[data-tour="run.timing"]')).toBeVisible();
    await page.getByRole('button', { name: 'Replay steps' }).click();
    await expect(clock).toHaveAttribute('data-state', 'replaying');
    await expect(clock).toContainText('Replaying at recorded speed');
    await expect(clock).toHaveAttribute('data-state', 'finished', { timeout: 15_000 });
    await expect(page.locator('[data-step="deliver"]')).toHaveAttribute('data-status', 'passed');
  });

  test('evidence focus and redaction toggle emit events', async ({ page }) => {
    const events = await captureEvents(page);
    await startRun(page, 'file_c1042');
    await expect(page.locator('[data-step="deliver"]')).toHaveAttribute('data-status', 'passed', { timeout: 20_000 });
    await page.locator('[data-tour="run.insights"] button[aria-label^="Show this quote"]').first().click();
    await page.locator('[data-tour="run.redaction"]').getByRole('button', { name: 'Before' }).click();
    const names = (await events()).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['evidence.focused', 'redaction.toggled']));
    // masked previews only, never raw originals
    await expect(page.locator('[data-tour="run.transcript"]')).not.toContainText('[PERSON_1]');
  });

  test('clicking a step shows what it did', async ({ page }) => {
    await startRun(page, 'file_c1042');
    await expect(page.locator('[data-step="deliver"]')).toHaveAttribute('data-status', 'passed', { timeout: 20_000 });
    await page.locator('[data-step="screen"] button').click();
    await expect(page.locator('[data-step="screen"] button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Step 4 of 10')).toBeVisible();
    await expect(page.getByText(/in English, with product feedback|Product feedback found, in English/)).toBeVisible();
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
