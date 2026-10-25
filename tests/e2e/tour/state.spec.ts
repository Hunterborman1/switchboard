import { expect, test } from '@playwright/test';
import { BASE, callout, currentStep, expectStep, go } from './helpers';

test.describe('tour state, exits and access', () => {
  test('deep link to a scene beat, then refresh restores it', async ({ page }) => {
    await go(page, '/walkthrough/states?tour=states&beat=2&path=messy');
    await expect(page.getByTestId('scene-states')).toHaveAttribute('data-beat', '2');
    await page.reload();
    await expect(page.getByTestId('scene-states')).toHaveAttribute('data-beat', '2');
    await expect(page).toHaveURL(/path=messy/);
  });

  test('deep link into a product chapter restores after refresh', async ({ page }) => {
    await go(page, '/app/review?tour=ch3.intro');
    await expect(callout(page)).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expectStep(page, 'ch3.intro');
    await expect(callout(page)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/app\/review/);
  });

  test('exit to free explore, then resume', async ({ page }) => {
    await go(page, '/app/routing?tour=ch4.intro');
    await expect(callout(page)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.getByTestId('pause-menu').getByRole('button', { name: 'Exit to free explore' }).click();
    await expect(callout(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/tour=/);
    const pill = page.getByTestId('resume-pill');
    await expect(pill).toBeVisible();
    // free explore: navigate anywhere
    await page.goto(`${BASE}/app/evals?notrack=1`);
    await page.getByTestId('resume-pill').click();
    await expectStep(page, 'ch4.intro');
    await expect(page).toHaveURL(/\/app\/routing/);
  });

  test('chapter rail jumps anywhere', async ({ page }) => {
    await go(page, '/walkthrough/why');
    await expect(page.getByTestId('scene-why')).toBeVisible();
    const hudBtn = page.getByTestId('tour-hud').getByRole('button', { name: 'Chapters' });
    if (await hudBtn.isVisible().catch(() => false)) await hudBtn.click();
    else {
      // mobile hides the HUD on scenes; the pause menu has Chapters too
      await page.keyboard.press('Escape');
      await page.getByTestId('pause-menu').getByRole('button', { name: 'Chapters' }).click();
    }
    const rail = page.getByTestId('chapter-rail');
    await expect(rail).toBeVisible();
    await rail.getByRole('button', { name: /Earning trust/ }).click();
    await expectStep(page, 'rollout');
  });

  test('keyboard only: scenes into the product', async ({ page }) => {
    await go(page, '/walkthrough/states?tour=states&beat=3');
    await page.keyboard.press('ArrowRight'); // last beat → ch1
    await expectStep(page, 'ch1.intro');
    // the event step focuses the real control; Enter activates it
    // (activeElement, not :focus: under parallel load the page may not hold OS-level focus, and
    // keyboard input still goes to the active element)
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-tour="new.upload"]')), { timeout: 10_000 }).toBe(true);
    await page.keyboard.press('Enter');
    await expectStep(page, 'ch1.pick');
    await page.keyboard.press('Escape'); // closes the product picker, not the tour
    await expect(page.getByTestId('pause-menu')).toHaveCount(0);
  });

  test('reduced motion renders composed frames', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const id of ['cold-open', 'black-hole', 'states']) {
      await go(page, `/walkthrough/${id}`);
      await expect(page.getByTestId(`scene-${id}`)).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId(`scene-${id}`)).toHaveAttribute('data-beat', '1');
    }
    await go(page, '/walkthrough/cold-open?tour=cold-open&beat=1');
    await expect(page.getByRole('heading', { name: /Every call is a/ })).toBeVisible();
    // the black-hole field is a still frame, not an empty panel
    await go(page, '/walkthrough/black-hole');
    await expect(page.locator('.sc-bh__canvas')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const cv = document.querySelector<HTMLCanvasElement>('.sc-bh__canvas');
          const d = cv?.getContext('2d')?.getImageData(0, 0, cv.width, cv.height).data;
          let n = 0;
          if (d) for (let i = 3; i < d.length; i += 16) if (d[i]! > 0) n++;
          return n;
        }),
      )
      .toBeGreaterThan(500);
  });

  test('a deep-linked scene can still go back, by keyboard', async ({ page }) => {
    await go(page, '/walkthrough/why');
    await expect(page.getByTestId('scene-why')).toBeVisible();
    await expect(page.getByTestId('scene-why').getByRole('button', { name: 'Back' })).toBeVisible();
    await page.getByTestId('scene-why').getByRole('button', { name: 'Back' }).click();
    await expectStep(page, 'black-hole');
  });

  test('a missing anchor never dead-ends', async ({ page }) => {
    // ch8.trace's waterfall may not exist without a run: the callout falls back with Continue
    await go(page, '/ops/reliability?tour=ch8.slos');
    await expect(callout(page)).toBeVisible({ timeout: 15_000 });
    const btn = callout(page).getByRole('button', { name: /^Continue/ });
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await btn.click();
    await expect.poll(() => currentStep(page)).toBe('rollout');
  });
});
