import { expect, test, type Locator, type Page } from '@playwright/test';
import { currentStep, expectStep, go, guide } from './helpers';

/** Every narrative scene: the route part, its step, the scene it draws, where Next goes, and the parts that must be on screen without a click. */
const SCENES: { part: string; step: string; scene: string; next: string; parts: string[] }[] = [
  { part: 'signal', step: 'signal', scene: 'signal', next: 'jobs', parts: ['signal-call', 'signal-lost', 'signal-becomes'] },
  { part: 'jobs', step: 'jobs', scene: 'jobs', next: 'built', parts: ['jobs-people', 'jobs-today', 'jobs-tomorrow'] },
  { part: 'built', step: 'built', scene: 'built', next: 'call.platform', parts: ['built-repo', 'built-options', 'built-how', 'built-real', 'built-simulated'] },
  { part: 'call', step: 'call.platform', scene: 'platform', next: 'call.intro', parts: [] },
  { part: 'operate', step: 'operate.hood', scene: 'hood', next: 'operate.metrics', parts: ['hood-prompts', 'hood-errors', 'hood-data'] },
  { part: 'trust', step: 'trust', scene: 'trust', next: 'future', parts: ['trust-rollout', 'trust-helpful', 'trust-reasons'] },
  { part: 'future', step: 'future', scene: 'future', next: 'future.scorecard', parts: ['future-roadmap', 'future-change', 'future-stack'] },
];

/** Fully drawn: the entrance has finished on its own (opacity 1), with no click or key press. */
async function expectDrawn(el: Locator) {
  await expect(el).toBeAttached();
  await expect(el).toHaveCSS('opacity', '1', { timeout: 5_000 });
}

/** Click somewhere on the scene that is not a control: the headline and the empty top-left of the stage. */
async function clickPageBody(page: Page, sceneId: string) {
  const scene = page.getByTestId(`scene-${sceneId}`);
  await scene.locator('h1').first().click();
  await scene.locator('.n-scene__body').click({ position: { x: 6, y: 6 } });
}

test.describe('narrative scenes', () => {
  test('the hub offers three doors and says how it was built', async ({ page }) => {
    await go(page, '/');
    await expect(page.getByTestId('hub')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Every call is a/ })).toBeVisible();
    await expect(page.getByText(/Built from scratch in 48 hours/)).toBeVisible();
    await expect(page.getByTestId('door-walkthrough')).toContainText('Start the presentation');
    await expect(page.getByTestId('door-walkthrough')).toContainText('10 chapters');
    await expect(page.getByTestId('door-explore')).toBeVisible();
    await expect(page.getByTestId('door-writeup')).toBeVisible();
    await expect(page.getByTestId('hub-claude')).toHaveAttribute('href', /\/app\/claude$/);
  });

  for (const s of SCENES) {
    test(`scene ${s.part}: everything on screen without a click, and only Next moves on`, async ({ page }) => {
      await go(page, `/walkthrough/${s.part}`);
      const scene = page.getByTestId(`scene-${s.scene}`);
      await expect(scene).toBeVisible();
      await expectStep(page, s.step);
      for (const id of s.parts) await expectDrawn(page.getByTestId(id));
      // No beats: the scene has no hidden parts waiting for a click.
      await expect(scene).not.toHaveAttribute('data-beat', /.*/);
      // A click on the page itself never advances.
      await clickPageBody(page, s.scene);
      await page.waitForTimeout(300);
      expect(await currentStep(page)).toBe(s.step);
      await page.getByTestId('scene-next').click();
      await expectStep(page, s.next);
    });
  }

  test('the platform scene draws all four columns at once', async ({ page }) => {
    await go(page, '/walkthrough/call');
    await expect(page.getByTestId('scene-platform')).toBeVisible();
    const cols = page.locator('.sc-plat__col');
    await expect(cols).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expectDrawn(cols.nth(i));
    await expect(page.getByTestId('scene-next')).toHaveText(/Open the product/);
  });

  test('scenes move with the arrow keys, not with Space or Enter on the page', async ({ page }) => {
    await go(page, '/walkthrough/signal');
    await expect(page.getByTestId('scene-signal')).toBeVisible();
    await expectStep(page, 'signal');
    await page.locator('body').press('Space');
    await page.locator('body').press('Enter');
    await page.waitForTimeout(300);
    expect(await currentStep(page)).toBe('signal');
    await page.keyboard.press('ArrowRight');
    await expectStep(page, 'jobs');
    await page.keyboard.press('ArrowLeft');
    await expectStep(page, 'signal');
  });

  test('what I built: the source link sits under the headline, next to the byline', async ({ page }) => {
    await go(page, '/walkthrough/built');
    const head = page.locator('.n-head', { has: page.getByRole('heading', { name: /What I built, and why/ }) });
    await expect(head.getByRole('heading', { name: /What I built, and why/ })).toBeVisible();
    await expect(head).toContainText('Built from scratch in 48 hours by Hunter Borman');
    const repo = head.getByTestId('built-repo');
    await expect(repo).toBeVisible();
    await expect(repo).toHaveAttribute('href', 'https://github.com/Hunterborman1/switchboard');
    await expect(repo).toHaveAttribute('target', '_blank');
    await expect(repo).toContainText('github.com/Hunterborman1/switchboard');
    const built = page.getByTestId('built-real');
    await expect(built).toContainText('Triage and a second opinion');
    await expect(built).toContainText('Evals with a promotion gate');
    const sim = page.getByTestId('built-simulated');
    await expect(sim).toContainText(/Connections to Slack, Jira/);
    await expect(sim).toContainText('a demo must never message real people');
    await expect(sim).toContainText('second agent');
  });

  test('what I built: the three verdicts and how it was built, together', async ({ page }) => {
    await go(page, '/walkthrough/built');
    const options = page.getByTestId('built-options');
    await expect(options).toContainText('RFP Responder');
    await expect(options).toContainText('Churn Predictor');
    await expect(options).toContainText('Chosen');
    await expect(page.getByTestId('built-how')).toContainText('TypeScript, not n8n, Gumloop or Zapier');
    await expect(page.getByTestId('built-how')).toContainText('One Cloudflare Worker, for now');
  });

  test('every call is a signal: the call, where it gets lost (an assumption), and what it becomes', async ({ page }) => {
    await go(page, '/walkthrough/signal');
    await expect(page.getByTestId('signal-call')).toContainText('CallRail’s been emailing me');
    const lost = page.getByTestId('signal-lost');
    await expect(lost).toContainText('Reaches the right owner');
    await expect(lost).toContainText('60 of every 100');
    await expect(lost).toContainText('Assumption');
    await expect(page.getByTestId('signal-becomes')).toContainText('Brightline renews in 12 weeks');
  });

  test('the chrome stays put between scenes: the top bar and the rail are never remounted', async ({ page }) => {
    await go(page, '/walkthrough/signal');
    await expect(page.getByTestId('scene-signal')).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as Record<string, Element | null>;
      w.__bar = document.querySelector('.n-topbar');
      w.__rail = document.querySelector('[data-testid="chapter-rail"]');
      w.__bottom = document.querySelector('.n-bottombar');
    });
    for (const next of ['jobs', 'built']) {
      await page.getByTestId('scene-next').click();
      await expectStep(page, next);
    }
    const same = await page.evaluate(() => {
      const w = window as unknown as Record<string, Element | null>;
      return w.__bar === document.querySelector('.n-topbar') && w.__rail === document.querySelector('[data-testid="chapter-rail"]') && w.__bottom === document.querySelector('.n-bottombar');
    });
    expect(same).toBe(true);
    await expect(page.locator('.n-topbar__chapter')).toHaveText('What I built, and why');
  });

  test('scorecard unlocks free explore, with the Guide in explore mode', async ({ page }) => {
    await go(page, '/walkthrough/future');
    await expectStep(page, 'future');
    await page.getByTestId('scene-next').click();
    await expectStep(page, 'future.scorecard');
    await expect(page.getByTestId('scorecard')).toBeVisible();
    await page.getByTestId('explore-freely').click();
    await expect(page).toHaveURL(/\/app\/new/);
    await expect(page).not.toHaveURL(/tour=/);
    await expect(guide(page)).toHaveAttribute('data-mode', 'explore');
  });
});
