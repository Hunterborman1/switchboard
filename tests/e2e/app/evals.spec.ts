import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Quality (evals)', () => {
  test('leads with the verdict and every rate carries its counts', async ({ page }) => {
    await gotoApp(page, '/app/evals');
    await expect(page.getByRole('heading', { name: 'Quality', level: 1 })).toBeVisible();
    await expect(page.getByText(/is live and passes all \d+ go-live checks|is live, with \d+ of \d+ go-live checks below target/)).toBeVisible();
    await expect(page.locator('[data-tour="evals.metrics"]')).toBeVisible();
    await expect(page.locator('[data-tour="evals.levels"]')).toBeVisible();
    await expect(page.locator('[data-tour="evals.candidate"]')).toBeVisible();
    // Rates always carry their counts ("93.2%", "41 of 44").
    await expect(page.locator('[data-tour="evals.metrics"] [data-testid="rate"]').first()).toContainText(/\d+(\.\d)?%\s*\d+ of \d+/);
    await expect(page.locator('[data-tour="evals.levels"] td').first()).toContainText(/\d+ of \d+/);
  });

  test('promote runs the gate and ends in a result from the data', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/evals');
    await page.locator('[data-tour="evals.promote"]').click();
    const gate = page.locator('[data-tour="evals.gate"]');
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await expect(gate).toContainText(/^(Blocked|Promoted):/);
    const ev = await events();
    const attempt = ev.find((e) => e.name === 'eval.promote_attempted') as { promoted?: boolean } | undefined;
    expect(attempt).toBeTruthy();
    // Every rule is listed with its outcome; cost and speed are reported, never gated.
    await expect(gate.locator('li').first()).toBeVisible();
    await expect(gate.locator('li', { hasText: 'Cost and speed' })).toContainText('Not gated');
    if (attempt?.promoted === false) await expect(gate.locator('li', { hasText: /Fail$/ }).first()).toBeVisible();
  });

  test('reduced motion shows the gate result immediately', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page, '/app/evals');
    await page.locator('[data-tour="evals.promote"]').click();
    await expect(page.locator('[data-tour="evals.gate"]')).toBeVisible({ timeout: 1_000 });
  });
});
