import { expect, test } from '@playwright/test';
import { currentStep, expectGuideOn, expectStep, go, guide } from './helpers';

const wide = (page: import('@playwright/test').Page) => (page.viewportSize()?.width ?? 0) >= 1200;
const phone = (page: import('@playwright/test').Page) => (page.viewportSize()?.width ?? 0) <= 900;

/** On phones the Guide is a sheet that may be folded: open it before reading or clicking inside. */
async function openGuide(page: import('@playwright/test').Page) {
  const bar = guide(page).getByTestId('guide-bar');
  if (phone(page) && (await bar.getAttribute('aria-expanded')) === 'false') await bar.click();
}

test.describe('presentation state, exits and the Guide', () => {
  test('start the presentation from the hub', async ({ page }) => {
    await go(page, '/');
    await expect(page.getByText('Built from scratch in 48 hours by Hunter Borman')).toBeVisible();
    await page.getByTestId('door-walkthrough').click();
    await expect(page).toHaveURL(/\/walkthrough\/cold-open/);
    await expect(page.getByTestId('scene-cold-open')).toBeVisible();
    await expectStep(page, 'cold-open');
  });

  test('deep link to a scene beat, then refresh restores it', async ({ page }) => {
    await go(page, '/walkthrough/states?tour=states&beat=2&path=messy');
    await expect(page.getByTestId('scene-states')).toHaveAttribute('data-beat', '2');
    await page.reload();
    await expect(page.getByTestId('scene-states')).toHaveAttribute('data-beat', '2');
    await expect(page).toHaveURL(/path=messy/);
  });

  test('deep link into a product chapter restores after refresh', async ({ page }) => {
    await go(page, '/app/review?tour=ch3.approve');
    await expectGuideOn(page, 'ch3.approve');
    await page.reload();
    await expectGuideOn(page, 'ch3.approve');
    await expect(page).toHaveURL(/\/app\/review/);
  });

  test('the chapter navigator jumps anywhere (rail on wide screens, menu on narrow)', async ({ page }) => {
    await go(page, '/walkthrough/why');
    await expect(page.getByTestId('scene-why')).toBeVisible();
    if (wide(page)) {
      const rail = page.getByTestId('chapter-rail');
      await expect(rail).toBeVisible();
      await expect(rail.locator('[aria-current="step"]')).toContainText('Why this option, and not the others');
      await rail.getByRole('button', { name: /Earning trust/ }).click();
    } else {
      await page.getByTestId('scene-chapters').click();
      const drawer = page.getByTestId('chapter-drawer');
      await expect(drawer).toBeVisible();
      await drawer.getByRole('button', { name: /Earning trust/ }).click();
    }
    await expectStep(page, 'rollout');
  });

  test('the Guide’s chapter picker lists every chapter and jumps into a product chapter', async ({ page }) => {
    await go(page, '/app/review?tour=ch3.approve');
    await expectGuideOn(page, 'ch3.approve');
    await openGuide(page);
    await guide(page).getByTestId('guide-chapters').click();
    const picker = page.getByTestId('chapter-picker');
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('button')).toHaveCount(19);
    await expect(picker.locator('[aria-current="step"]')).toContainText('Human in the loop');
    await picker.getByRole('button', { name: /Prove it/ }).click();
    await expectStep(page, 'ch7.metrics');
    await expect(page).toHaveURL(/\/app\/evals/);
  });

  test('explore on your own, a nudge on two screens, then resume at the same step', async ({ page }) => {
    await go(page, '/app/routing?tour=ch4.rule');
    await expectGuideOn(page, 'ch4.rule');
    await openGuide(page);
    await guide(page).getByTestId('guide-explore').click();
    await expect(guide(page)).toHaveAttribute('data-mode', 'explore');
    await expect(page).not.toHaveURL(/tour=/);
    await openGuide(page);
    await expect(guide(page).getByTestId('guide-title')).toHaveText('Change who hears about what');
    // Another screen, its own nudge (client-side navigation keeps the session).
    await page.evaluate(() => {
      window.history.pushState({}, '', '/repo/invoca/app/connections');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/app\/connections/);
    await openGuide(page);
    await expect(guide(page).getByTestId('guide-nudge')).toContainText('Connections are simulated');
    await guide(page).getByTestId('guide-resume').click();
    await expectStep(page, 'ch4.rule');
    await expect(page).toHaveURL(/\/app\/routing/);
    await expectGuideOn(page, 'ch4.rule');
  });

  test('opening the product from the hub explores, with Start the presentation', async ({ page }) => {
    await go(page, '/');
    await page.getByTestId('door-explore').click();
    await expect(page).toHaveURL(/\/app\/overview/);
    await expect(guide(page)).toHaveAttribute('data-mode', 'explore');
    await openGuide(page);
    await expect(guide(page).getByTestId('guide-resume')).toHaveText(/Start the presentation/);
  });

  test('minimizing the Guide is remembered', async ({ page }) => {
    test.skip(phone(page), 'phones fold the sheet instead of minimizing');
    await go(page, '/app/overview');
    await guide(page).getByTestId('guide-minimize').click();
    await expect(page.getByTestId('guide-strip')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('guide-strip')).toBeVisible();
    await page.getByTestId('guide-expand').click();
    await expect(guide(page).getByTestId('guide-nudge')).toBeVisible();
  });

  test('keyboard only: scenes into the product, and → through a product step', async ({ page }) => {
    await go(page, '/walkthrough/platform?tour=platform&beat=3');
    await page.keyboard.press('ArrowRight'); // last beat of the last scene before the product
    await expectStep(page, 'ch1.intro');
    // the event step focuses the real control; Enter activates it
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-tour="new.upload"]')), { timeout: 10_000 }).toBe(true);
    await page.keyboard.press('Enter');
    await expectStep(page, 'ch1.pick');
    await page.keyboard.press('Escape'); // closes the product picker, not the presentation
    await expect(page.locator('[data-tour="picker.dialog"]')).toHaveCount(0);
    expect(await currentStep(page)).toBe('ch1.pick');
    // A "next" step: → advances, ← goes back.
    await go(page, '/app/connections?tour=ch4.connections');
    await expectGuideOn(page, 'ch4.connections');
    await page.keyboard.press('ArrowRight');
    await expectStep(page, 'ch5.intro');
    await page.keyboard.press('ArrowLeft');
    await expectStep(page, 'ch4.connections');
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
    // the black-hole flow is drawn in its final frame at once: every handoff bar filled
    await go(page, '/walkthrough/black-hole?tour=black-hole&beat=1');
    await expect(page.locator('.sc-bh__flow')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('.sc-bh__bar')).map((b) => Math.round((b.getBoundingClientRect().width / (b.parentElement?.getBoundingClientRect().width || 1)) * 100)),
        ),
      )
      .toEqual([100, 72, 55, 40]);
    // the Guide appears without an entrance animation
    await go(page, '/app/review?tour=ch3.approve');
    await expectGuideOn(page, 'ch3.approve');
    expect(await guide(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('a deep-linked scene can still go back', async ({ page }) => {
    await go(page, '/walkthrough/why');
    await expect(page.getByTestId('scene-why')).toBeVisible();
    await page.getByTestId('scene-why').getByRole('button', { name: 'Back' }).click();
    await expectStep(page, 'black-hole');
  });

  test('a missing target never dead-ends', async ({ page }) => {
    // No run and no Agent Ops data in fixture mode: the trace isn't on screen, and the Guide still offers Next.
    await go(page, '/app/overview?tour=ch8.trace');
    await expectGuideOn(page, 'ch8.trace');
    await openGuide(page);
    const btn = guide(page).getByRole('button', { name: /^Next/ });
    await expect(btn.first()).toBeVisible({ timeout: 15_000 });
    await btn.first().click();
    await expect.poll(() => currentStep(page)).toBe('rollout');
  });
});
