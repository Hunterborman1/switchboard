import { expect, test } from '@playwright/test';
import { BASE, go } from './helpers';

/**
 * /write-up: the write-up and the Q&A on one page. Every section has an anchor and a contents
 * entry, nothing needs a click to be read, /backup/:topic lands on its section, and the "For AI
 * assistants" block offers the docs .zip, this page as Markdown and Connect Claude.
 */
const PARTS = ['problem', 'platform', 'system', 'rollout', 'next', 'role'];
const TOPICS = ['cost', 'security', 'failure', 'build-vs-buy', 'metrics', 'agent-ops', 'differently'];

test.describe('write-up and Q&A', () => {
  test('one page: every part and every question renders, with a contents entry', async ({ page }) => {
    await go(page, '/write-up');
    await expect(page.getByTestId('write-up')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Every call is a signal.' })).toBeVisible();
    await expect(page.getByText(/Built from scratch in 48 hours/)).toBeVisible();
    for (const id of [...PARTS, 'questions', ...TOPICS]) {
      await expect(page.locator(`section#${id}`), id).toHaveCount(1);
      await expect(page.locator(`#${id}-h`), id).not.toBeEmpty();
    }
    const toc = page.getByTestId('writeup-toc');
    await expect(toc.getByText('Questions', { exact: true })).toBeVisible();
    for (const id of [...PARTS, ...TOPICS]) await expect(toc.locator(`a[href="#${id}"]`), id).toHaveCount(1);
    // The cost figures settle as live (or, if the API fails, as the recorded values).
    await expect(page.getByTestId('writeup-cost-live')).toHaveAttribute('data-state', /^(live|recorded)$/);
  });

  test('nothing has to be clicked to be read', async ({ page }) => {
    await go(page, '/write-up');
    const main = page.getByTestId('write-up');
    await expect(main.locator('[role="tab"], [role="tablist"], details, [aria-expanded], [hidden]')).toHaveCount(0);
    for (const id of TOPICS) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test('a contents link scrolls to its section', async ({ page }) => {
    await go(page, '/write-up');
    await page.getByTestId('writeup-toc').locator('a[href="#metrics"]').click();
    await expect(page).toHaveURL(/#metrics$/);
    await expect(page.locator('#metrics-h')).toBeInViewport();
  });

  for (const topic of TOPICS) {
    test(`/backup/${topic} lands on its section of the write-up`, async ({ page }) => {
      await page.goto(`${BASE}/backup/${topic}?notrack=1`);
      await expect(page).toHaveURL(new RegExp(`/write-up\\?notrack=1#${topic}$`));
      await expect(page.locator(`#${topic}-h`)).toBeInViewport();
    });
  }

  test('/backup on its own lands on the Q&A', async ({ page }) => {
    await page.goto(`${BASE}/backup?notrack=1`);
    await expect(page).toHaveURL(/\/write-up\?notrack=1#questions$/);
    await expect(page.locator('#questions-h')).toBeInViewport();
  });

  test('the AI block offers the docs .zip, this page as Markdown and Connect Claude', async ({ page }) => {
    await go(page, '/write-up');
    const ai = page.getByTestId('writeup-ai');
    await expect(ai).toBeVisible();
    await expect(ai.getByRole('heading', { name: 'For AI assistants' })).toBeVisible();
    await expect(ai.getByTestId('writeup-zip')).toHaveAttribute('href', /\/repo\/invoca\/switchboard-docs\.zip$/);
    await expect(ai.getByTestId('writeup-zip')).toContainText('Download for AI');
    await expect(ai.getByTestId('writeup-markdown')).toHaveAttribute('href', /\/repo\/invoca\/write-up\.md$/);
    await expect(ai.getByTestId('writeup-claude')).toHaveAttribute('href', /\/repo\/invoca\/app\/claude$/);
    await expect(ai.getByTestId('writeup-llms')).toHaveAttribute('href', /\/repo\/invoca\/llms\.txt$/);
    await expect(ai.getByTestId('writeup-repo')).toHaveAttribute('href', /^https:\/\/github\.com\//);
  });

  test('the hub sends each question to its section and offers the .zip', async ({ page }) => {
    await go(page, '/');
    const nav = page.getByRole('navigation', { name: 'Questions and answers' });
    for (const topic of TOPICS) await expect(nav.locator(`a[href$="/write-up#${topic}"]`), topic).toHaveCount(1);
    await expect(page.getByTestId('hub-zip')).toHaveAttribute('href', /\/repo\/invoca\/switchboard-docs\.zip$/);
  });

  test('no horizontal page scroll', async ({ page }) => {
    await go(page, '/write-up');
    await expect(page.getByTestId('writeup-cost-live')).toHaveAttribute('data-state', /^(live|recorded)$/);
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw);
  });
});
