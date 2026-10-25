import { expect, test } from '@playwright/test';
import { BASE, expectStep, go } from './helpers';

const SCENES: { id: string; beats: number; next: string }[] = [
  { id: 'cold-open', beats: 2, next: 'black-hole' },
  { id: 'black-hole', beats: 3, next: 'why' },
  { id: 'why', beats: 3, next: 'jtbd' },
  { id: 'jtbd', beats: 2, next: 'states' },
  { id: 'states', beats: 4, next: 'ch1.intro' },
  { id: 'rollout', beats: 3, next: 'horizon' },
  { id: 'horizon', beats: 2, next: 'production' },
  { id: 'production', beats: 2, next: 'scorecard' },
];

test.describe('narrative scenes', () => {
  test('the hub offers three doors', async ({ page }) => {
    await go(page, '/');
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Every call is a/ })).toBeVisible();
    await expect(page.getByTestId('door-walkthrough')).toBeVisible();
    await expect(page.getByTestId('door-explore')).toBeVisible();
    await expect(page.getByTestId('door-writeup')).toBeVisible();
  });

  test('start the walkthrough from the hub', async ({ page }) => {
    await go(page, '/');
    await page.getByTestId('door-walkthrough').click();
    await expect(page).toHaveURL(/\/walkthrough\/cold-open/);
    await expect(page.getByTestId('scene-cold-open')).toBeVisible();
  });

  for (const s of SCENES) {
    test(`scene ${s.id} renders every beat and advances`, async ({ page }) => {
      await go(page, `/walkthrough/${s.id}`);
      await expect(page.getByTestId(`scene-${s.id}`)).toBeVisible();
      await expectStep(page, s.id);
      for (let b = 1; b < s.beats; b++) {
        await page.keyboard.press('ArrowRight');
        await expect(page.getByTestId(`scene-${s.id}`)).toHaveAttribute('data-beat', String(b));
      }
      await page.getByTestId('scene-next').click();
      await expectStep(page, s.next);
    });
  }

  test('jobs-to-be-done cards flip with click and keyboard', async ({ page }) => {
    await go(page, '/walkthrough/jtbd');
    const cards = page.locator('.n-persona');
    await expect(cards).toHaveCount(4);
    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await cards.nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
    // flipping a card never advances the scene
    await expectStep(page, 'jtbd');
  });

  test('back steps through beats, then to the previous scene', async ({ page }) => {
    await go(page, '/walkthrough/why');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('scene-why')).toHaveAttribute('data-beat', '1');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('scene-why')).toHaveAttribute('data-beat', '0');
  });

  test('scorecard renders and unlocks free explore', async ({ page }) => {
    await go(page, '/walkthrough/scorecard');
    await expect(page.getByTestId('scorecard')).toBeVisible();
    await page.getByTestId('explore-freely').click();
    await expect(page).toHaveURL(/\/app\/new/);
    await expect(page).not.toHaveURL(/tour=/);
    await expect(page.getByTestId('resume-pill')).toBeVisible();
  });

  test('write-up and every backup scene render standalone', async ({ page }) => {
    await go(page, '/write-up');
    await expect(page.locator('h1').first()).toBeVisible();
    for (const t of ['cost', 'security', 'failure', 'build-vs-buy', 'metrics', 'agent-ops', 'differently']) {
      await page.goto(`${BASE}/backup/${t}?notrack=1`);
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
  });
});
