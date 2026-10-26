import { expect, test } from '@playwright/test';
import { advanceUntil, currentStep, expectGuideOn, expectStep, go, guide, pickAndRun } from './helpers';

/**
 * The main story end to end through every product chapter, and other files taking their own
 * path through the run in chapter 4 (A call comes in). Runs against the fixture-mode product.
 */
test('main branch end to end: every product chapter, real actions where the step asks', async ({ page }) => {
  test.setTimeout(150_000);
  await go(page, '/app/new?tour=call.intro');
  await expectGuideOn(page, 'call.intro');
  await expect(guide(page)).toContainText('Chapter 4 of 10');
  await pickAndRun(page, 'main');
  await expect(page).toHaveURL(/path=main/);

  // Chapter 4, continued: the run, the latency story, and the timing card.
  const seen: string[] = [];
  await advanceUntil(page, /^call\.timing$/, { seen });
  expect(seen).toEqual(expect.arrayContaining(['call.watch', 'call.screen', 'call.ground', 'call.gate']));
  await expect(page.locator('[data-tour="run.timing"]')).toBeVisible();
  await expect(guide(page)).toContainText(/Why it took/);
  await guide(page).getByRole('button', { name: /^Next/ }).click();

  // Chapter 5: approve one with the keyboard, the real action.
  await expectStep(page, 'review.approve');
  await expect(guide(page)).toContainText('Your turn');
  await expect(page.locator('[data-tour="review.approve"]')).toBeVisible();
  await page.keyboard.press('a');
  await expectStep(page, 'review.edit');

  // The rest: real actions for the theme and the promote check, skips where a form would be needed.
  await advanceUntil(page, /^patterns\.intro$/);
  await page.locator('[data-tour="theme.c1042"]').first().click();
  await expectStep(page, /^patterns\.(theme|ship|loop)$/);
  await advanceUntil(page, /^operate\.promote$/);
  await page.locator('[data-tour="evals.promote"]').first().click();
  await expectStep(page, 'operate.gate', 30_000);
  await advanceUntil(page, /^production$/);
  await expect(page).toHaveURL(/\/walkthrough\/production/);
});

const BRANCHES: { path: string; expectSeen?: string; expectNotSeen?: string }[] = [
  { path: 'security', expectSeen: 'call.screen' },
  { path: 'negative', expectNotSeen: 'call.ground' },
  { path: 'privacy', expectSeen: 'call.privacy' },
  { path: 'clean', expectSeen: 'call.clean' },
];

for (const b of BRANCHES) {
  test(`branch ${b.path}: picker, run, then review`, async ({ page }) => {
    await go(page, '/app/new?tour=call.intro');
    await pickAndRun(page, b.path);
    await expect(page).toHaveURL(new RegExp(`path=${b.path}`));
    const seen: string[] = [];
    await advanceUntil(page, /^review\./, { seen });
    if (b.expectSeen) expect(seen).toContain(b.expectSeen);
    if (b.expectNotSeen) expect(seen).not.toContain(b.expectNotSeen);
    await expect(page).toHaveURL(/\/app\/review/);
    expect(await currentStep(page)).toBe('review.approve');
  });
}

test('“Try another file” loops back to the picker and counts scenarios', async ({ page }) => {
  await go(page, '/app/new?tour=call.intro');
  await pickAndRun(page, 'main');
  await advanceUntil(page, /^call\.timing$/);
  await expect(guide(page).getByTestId('guide-checkpoint')).toContainText('1 of 6');
  await guide(page).getByRole('button', { name: 'Try another file' }).click();
  await expectStep(page, 'call.intro');
  await pickAndRun(page, 'security');
  await advanceUntil(page, /^call\.timing$/);
  await expect(guide(page).getByTestId('guide-checkpoint')).toContainText('2 of 6');
});
