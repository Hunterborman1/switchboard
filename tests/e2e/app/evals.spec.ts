import { expect, test } from '@playwright/test';
import { captureEvents, gotoApp } from './helpers';

test.describe('Evals', () => {
  test('every metric block renders with denominators', async ({ page }) => {
    await gotoApp(page, '/app/evals');
    await expect(page.locator('[data-tour="evals.metrics"]')).toBeVisible();
    await expect(page.locator('[data-tour="evals.levels"]')).toBeVisible();
    await expect(page.locator('[data-tour="evals.candidate"]')).toBeVisible();
    // Rates always carry their counts ("93.2% · 41 / 44").
    await expect(page.locator('[data-tour="evals.metrics"] [data-testid="rate-with-denominator"]').first()).toContainText('/');
    await expect(page.locator('[data-tour="evals.levels"] td').first()).toContainText('/');
  });

  test('promote runs the gate and ends in a result from the data', async ({ page }) => {
    const events = await captureEvents(page);
    await gotoApp(page, '/app/evals');
    await page.locator('[data-tour="evals.promote"] button').click();
    const gate = page.locator('[data-tour="evals.gate"]');
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await expect(gate).toContainText(/PROMOTION BLOCKED|PROMOTED/);
    const ev = await events();
    const attempt = ev.find((e) => e.name === 'eval.promote_attempted') as { promoted?: boolean } | undefined;
    expect(attempt).toBeTruthy();
    if (attempt?.promoted === false) await expect(gate.locator('li').first()).toBeVisible();
  });

  test('reduced motion shows the gate result immediately', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page, '/app/evals');
    await page.locator('[data-tour="evals.promote"] button').click();
    await expect(page.locator('[data-tour="evals.gate"]')).toBeVisible({ timeout: 1_000 });
  });
});
