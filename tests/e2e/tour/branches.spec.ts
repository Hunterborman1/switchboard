import { expect, test } from '@playwright/test';
import { advanceUntil, currentStep, expectStep, go, pickAndRun } from './helpers';

/**
 * Every Chapter 1 file choice takes its own path through Chapters 2–3 and rejoins at
 * Chapter 4. Run against the fixture-mode product.
 */
const BRANCHES: { path: string; expectSeen?: string; expectNotSeen?: string }[] = [
  { path: 'main', expectSeen: 'ch2.ground' },
  { path: 'clean', expectSeen: 'ch2.clean' },
  { path: 'messy', expectSeen: 'ch2.messy' },
  { path: 'security', expectSeen: 'ch2.screen' },
  { path: 'negative', expectNotSeen: 'ch2.ground' },
  { path: 'privacy', expectSeen: 'ch2.privacy' },
];

for (const b of BRANCHES) {
  test(`branch ${b.path}: picker → run → review → routing`, async ({ page }) => {
    await go(page, '/app/new?tour=ch1.intro');
    await pickAndRun(page, b.path);
    await expect(page).toHaveURL(new RegExp(`path=${b.path}`));
    const seen: string[] = [];
    await advanceUntil(page, /^ch3\./, { seen });
    if (b.expectSeen) expect(seen).toContain(b.expectSeen);
    if (b.expectNotSeen) expect(seen).not.toContain(b.expectNotSeen);
    // the security branch narrates the injection flag on the screen step
    await advanceUntil(page, /^ch3\.fork$/, { seen });
    // the fork offers another file or Continue; take Continue into Chapter 4
    await page.getByTestId('tour-callout').getByRole('button', { name: /^Continue/ }).click();
    await expectStep(page, 'ch4.intro');
    await expect(page).toHaveURL(/\/app\/routing/);
    expect(await currentStep(page)).toBe('ch4.intro');
  });
}

test('“Try another file” loops back to the picker and counts scenarios', async ({ page }) => {
  await go(page, '/app/new?tour=ch1.intro');
  await pickAndRun(page, 'main');
  await advanceUntil(page, /^ch3\.fork$/);
  await expect(page.getByTestId('tour-hud')).toContainText('1/6');
  await page.getByTestId('tour-callout').getByRole('button', { name: 'Try another file' }).click();
  await expectStep(page, 'ch1.intro');
  await pickAndRun(page, 'clean');
  await expect(page.getByTestId('tour-hud')).toContainText('2/6');
});
