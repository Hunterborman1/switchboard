import { expect, test } from '@playwright/test';
import { advanceUntil, currentStep, expectGuideOn, expectStep, go, guide, pickAndRun } from './helpers';

/**
 * The main story end to end through every product chapter, and other files taking their own
 * path through Chapter 9 (Watch it run). Runs against the fixture-mode product.
 */
test('main branch end to end: every product chapter, real actions where the step asks', async ({ page }) => {
  test.setTimeout(150_000);
  await go(page, '/app/new?tour=ch1.intro');
  await expectGuideOn(page, 'ch1.intro');
  await expect(guide(page)).toContainText('Chapter 8 of 19');
  await pickAndRun(page, 'main');
  await expect(page).toHaveURL(/path=main/);

  // Chapter 9: the run, the latency beat, and the timing card.
  const seen: string[] = [];
  await advanceUntil(page, /^ch2\.timing$/, { seen });
  expect(seen).toEqual(expect.arrayContaining(['ch2.intro', 'ch2.screen', 'ch2.ground', 'ch2.gate']));
  await expect(page.locator('[data-tour="run.timing"]')).toBeVisible();
  await expect(guide(page)).toContainText(/Why it took/);
  await guide(page).getByRole('button', { name: /^Next/ }).click();

  // Chapter 10: approve one with the keyboard, the real action.
  await expectStep(page, 'ch3.approve');
  await expect(guide(page)).toContainText('Your turn');
  await expect(page.locator('[data-tour="review.approve"]')).toBeVisible();
  await page.keyboard.press('a');
  await expectStep(page, 'ch3.edit');

  // The rest: real actions for the theme and the promote check, skips where a form would be needed.
  await advanceUntil(page, /^ch5\.intro$/);
  await page.locator('[data-tour="theme.c1042"]').first().click();
  await expectStep(page, /^ch5\.theme$|^ch6\./);
  await advanceUntil(page, /^ch7\.promote$/);
  await page.locator('[data-tour="evals.promote"]').first().click();
  await expectStep(page, 'ch7.gate', 30_000);
  await advanceUntil(page, /^rollout$/);
  await expect(page).toHaveURL(/\/walkthrough\/rollout/);
});

const BRANCHES: { path: string; expectSeen?: string; expectNotSeen?: string }[] = [
  { path: 'security', expectSeen: 'ch2.screen' },
  { path: 'negative', expectNotSeen: 'ch2.ground' },
  { path: 'privacy', expectSeen: 'ch2.privacy' },
  { path: 'clean', expectSeen: 'ch2.clean' },
];

for (const b of BRANCHES) {
  test(`branch ${b.path}: picker, run, then review`, async ({ page }) => {
    await go(page, '/app/new?tour=ch1.intro');
    await pickAndRun(page, b.path);
    await expect(page).toHaveURL(new RegExp(`path=${b.path}`));
    const seen: string[] = [];
    await advanceUntil(page, /^ch3\./, { seen });
    if (b.expectSeen) expect(seen).toContain(b.expectSeen);
    if (b.expectNotSeen) expect(seen).not.toContain(b.expectNotSeen);
    await expect(page).toHaveURL(/\/app\/review/);
    expect(await currentStep(page)).toBe('ch3.approve');
  });
}

test('“Try another file” loops back to the picker and counts scenarios', async ({ page }) => {
  await go(page, '/app/new?tour=ch1.intro');
  await pickAndRun(page, 'main');
  await advanceUntil(page, /^ch2\.timing$/);
  await expect(guide(page).getByTestId('guide-checkpoint')).toContainText('1 of 6');
  await guide(page).getByRole('button', { name: 'Try another file' }).click();
  await expectStep(page, 'ch1.intro');
  await pickAndRun(page, 'security');
  await advanceUntil(page, /^ch2\.timing$/);
  await expect(guide(page).getByTestId('guide-checkpoint')).toContainText('2 of 6');
});
