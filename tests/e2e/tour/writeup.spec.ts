import { expect, test } from '@playwright/test';
import { BASE, go } from './helpers';

/**
 * The read-through pages: the write-up's index (/write-up), one page per chapter
 * (/write-up/:chapter) and one Q&A page per topic (/backup/:topic). Every page renders from
 * src/shared/writeup, links its own Markdown and the docs .zip, and needs no click to be read.
 */
const CHAPTERS = [
  { id: 'signal', title: 'Every call is a signal', group: 'Introduction' },
  { id: 'jobs', title: 'Jobs to be done, today and tomorrow', group: 'Introduction' },
  { id: 'built', title: 'What I built, and why', group: 'Introduction' },
  { id: 'call', title: 'A call comes in', group: 'The platform' },
  { id: 'review', title: 'Human in the loop', group: 'The platform' },
  { id: 'routing', title: 'Right owner, right channel', group: 'The platform' },
  { id: 'patterns', title: 'Patterns, and closing the loop', group: 'The platform' },
  { id: 'operate', title: 'Under the hood: prove it, then operate it', group: 'The platform' },
  { id: 'trust', title: 'Earning trust: rollout and adoption', group: 'Closing' },
  { id: 'future', title: 'The next 12–18 months', group: 'Closing' },
];
const ANSWERS = ['Process design: jobs to be done, today and tomorrow', 'The build: how it works', 'Rollout and trust', 'The next 12–18 months'];
const TOPICS = ['cost', 'security', 'failure', 'build-vs-buy', 'metrics', 'agent-ops', 'differently'];

/** Nothing on the page hides content behind a click. */
const REVEAL = '[role="tab"], [role="tablist"], details, [aria-expanded], [hidden]';

async function noSideScroll(page: import('@playwright/test').Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}

test.describe('the write-up index', () => {
  test('says what this is, answers the four things plainly, then lists the ten chapters by group and the Q&A', async ({ page }) => {
    await go(page, '/write-up');
    await expect(page.getByTestId('write-up')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Every call is a signal.' })).toBeVisible();
    await expect(page.getByText(/I built Switchboard from scratch in 48 hours/)).toBeVisible();
    const answers = page.getByTestId('writeup-answers');
    for (const a of ANSWERS) await expect(answers.getByRole('heading', { level: 2, name: a })).toBeVisible();
    await expect(answers.locator(`a[href="${BASE}/write-up/jobs"]`)).toHaveCount(1);
    await expect(page.getByTestId('write-up')).not.toContainText(/four questions|question \d/i);
    const chapters = page.getByTestId('writeup-chapters');
    for (const g of ['Introduction', 'The platform', 'Closing']) await expect(chapters.getByRole('heading', { level: 3, name: g })).toBeVisible();
    for (const c of CHAPTERS) {
      const row = page.getByTestId(`writeup-chapter-${c.id}`);
      await expect(row, c.id).toHaveAttribute('href', `${BASE}/write-up/${c.id}`);
      await expect(row, c.id).toContainText(c.title);
    }
    for (const t of TOPICS) await expect(page.getByTestId(`writeup-question-${t}`), t).toHaveAttribute('href', `${BASE}/backup/${t}`);
    await expect(page.getByTestId('write-up').locator(REVEAL)).toHaveCount(0);
    await noSideScroll(page);
  });

  test('the AI block offers the docs .zip, the Markdown, llms.txt and Connect Claude', async ({ page }) => {
    await go(page, '/write-up');
    const ai = page.getByTestId('writeup-ai');
    await expect(ai.getByRole('heading', { name: 'For AI assistants' })).toBeVisible();
    await expect(ai.getByTestId('writeup-zip')).toHaveAttribute('href', `${BASE}/switchboard-docs.zip`);
    await expect(ai.getByTestId('writeup-zip')).toContainText('Download for AI');
    await expect(ai.getByTestId('writeup-markdown')).toHaveAttribute('href', `${BASE}/write-up.md`);
    await expect(ai.getByTestId('writeup-claude')).toHaveAttribute('href', `${BASE}/app/claude`);
    await expect(ai.getByTestId('writeup-llms')).toHaveAttribute('href', `${BASE}/llms.txt`);
    await expect(ai.getByTestId('writeup-repo')).toHaveAttribute('href', /^https:\/\/github\.com\//);
  });

  test('a chapter row opens its page', async ({ page }) => {
    await go(page, '/write-up');
    await page.getByTestId('writeup-chapter-review').click();
    await expect(page).toHaveURL(/\/write-up\/review(\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: 'Human in the loop' })).toBeVisible();
  });

  test('old links into the one-page write-up land on the page that holds that part', async ({ page }) => {
    await page.goto(`${BASE}/write-up?notrack=1#cost`);
    await expect(page).toHaveURL(/\/backup\/cost\?notrack=1$/);
    await expect(page.getByTestId('backup-page')).toHaveAttribute('data-topic', 'cost');
    await page.goto(`${BASE}/write-up?notrack=1#rollout`);
    await expect(page).toHaveURL(/\/write-up\/trust\?notrack=1$/);
  });
});

test.describe('a page per chapter', () => {
  CHAPTERS.forEach((c, i) => {
    test(`chapter ${i + 1}: ${c.id}`, async ({ page }) => {
      await go(page, `/write-up/${c.id}`);
      const main = page.getByTestId('write-up-chapter');
      await expect(main).toHaveAttribute('data-chapter', c.id);
      await expect(page.getByRole('heading', { level: 1, name: c.title })).toBeVisible();
      await expect(main.getByText(`${c.group}, chapter ${i + 1} of 10`)).toBeVisible();
      // Its sections, each with a contents entry.
      const toc = page.getByTestId('writeup-toc');
      const sections = main.locator('article > section.wu-sec');
      expect(await sections.count()).toBeGreaterThanOrEqual(3);
      for (const id of await sections.evaluateAll((els) => els.map((e) => e.id))) await expect(toc.locator(`a[href$="#${id}"]`), id).toHaveCount(1);
      // Open it in the presentation; its Markdown; the .zip.
      await expect(page.getByTestId('writeup-present')).toHaveAttribute('href', `${BASE}/walkthrough/${c.id}`);
      await expect(page.getByTestId('writeup-chapter-md')).toHaveAttribute('href', `${BASE}/write-up/${c.id}.md`);
      await expect(page.getByTestId('writeup-chapter-zip')).toHaveAttribute('href', `${BASE}/switchboard-docs.zip`);
      // Previous and next.
      await expect(page.getByTestId('writeup-prev')).toHaveAttribute('href', i > 0 ? `${BASE}/write-up/${CHAPTERS[i - 1]!.id}` : `${BASE}/write-up`);
      await expect(page.getByTestId('writeup-next')).toHaveAttribute('href', i < CHAPTERS.length - 1 ? `${BASE}/write-up/${CHAPTERS[i + 1]!.id}` : `${BASE}/backup/cost`);
      await expect(main.locator(REVEAL)).toHaveCount(0);
      await noSideScroll(page);
    });
  });

  test('next moves to the next chapter and starts at its top', async ({ page }) => {
    await go(page, '/write-up/signal');
    await page.getByTestId('writeup-next').click();
    await expect(page).toHaveURL(/\/write-up\/jobs(\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: CHAPTERS[1]!.title })).toBeInViewport();
  });

  test('a contents link scrolls to its section', async ({ page }) => {
    await go(page, '/write-up/call');
    await page.getByTestId('writeup-toc').locator('a[href$="#numbers"]').click();
    await expect(page).toHaveURL(/#numbers$/);
    await expect(page.locator('#numbers-h')).toBeInViewport();
  });

  test('"Open in the presentation" starts the presentation at that chapter', async ({ page }) => {
    await go(page, '/write-up/signal');
    await page.getByTestId('writeup-present').click();
    await expect(page).toHaveURL(/\/walkthrough\/signal/);
    await expect(page.getByTestId('scene-signal')).toBeVisible();
  });

  test('an unknown chapter is the not-found page', async ({ page }) => {
    await go(page, '/write-up/nope');
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});

test.describe('a page per question', () => {
  for (const topic of TOPICS) {
    test(`/backup/${topic}`, async ({ page }) => {
      await go(page, `/backup/${topic}`);
      const main = page.getByTestId('backup-page');
      await expect(main).toHaveAttribute('data-topic', topic);
      await expect(main.getByText('Questions and answers', { exact: true })).toBeVisible();
      await expect(main).not.toContainText(/question \d of/i);
      await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
      // The topics are links, one page each.
      const tabs = page.getByRole('navigation', { name: 'Q&A topics' });
      for (const t of TOPICS) await expect(tabs.locator(`a[href="${BASE}/backup/${t}"]`), t).toHaveCount(1);
      await expect(tabs.locator('a.is-active')).toHaveAttribute('href', `${BASE}/backup/${topic}`);
      await expect(page.getByTestId('backup-md')).toHaveAttribute('href', `${BASE}/backup/${topic}.md`);
      await expect(page.getByTestId('backup-zip')).toHaveAttribute('href', `${BASE}/switchboard-docs.zip`);
      if (topic === 'cost') await expect(page.getByTestId('backup-cost-live')).toHaveAttribute('data-state', /^(live|recorded)$/);
      await expect(main.locator(REVEAL)).toHaveCount(0);
      await noSideScroll(page);
    });
  }

  test('/backup on its own lists every question', async ({ page }) => {
    await go(page, '/backup');
    await expect(page.getByTestId('backup-page')).toHaveAttribute('data-topic', 'index');
    for (const t of TOPICS) await expect(page.getByTestId(`backup-index-${t}`), t).toHaveAttribute('href', `${BASE}/backup/${t}`);
    await expect(page.getByTestId('backup-md')).toHaveAttribute('href', `${BASE}/backup.md`);
  });

  test('a topic link moves to that question', async ({ page }) => {
    await go(page, '/backup/cost');
    await page.getByRole('navigation', { name: 'Q&A topics' }).getByRole('link', { name: 'Build vs buy' }).click();
    await expect(page).toHaveURL(/\/backup\/build-vs-buy/);
    await expect(page.getByRole('heading', { level: 1, name: 'Build vs buy' })).toBeVisible();
  });

  test('an unknown topic is the not-found page', async ({ page }) => {
    await go(page, '/backup/nope');
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});

test('the hub sends each question to its page and offers the write-up and the .zip', async ({ page }) => {
  await go(page, '/');
  const nav = page.getByRole('navigation', { name: 'Questions and answers' });
  for (const topic of TOPICS) await expect(nav.locator(`a[href="${BASE}/backup/${topic}"]`), topic).toHaveCount(1);
  await expect(page.getByTestId('door-writeup')).toHaveAttribute('href', `${BASE}/write-up`);
  await expect(page.getByTestId('door-writeup')).toContainText('One short page per chapter');
  await expect(page.getByTestId('hub-zip')).toHaveAttribute('href', `${BASE}/switchboard-docs.zip`);
});

test('the presenter view’s Q&A buttons open the question’s page in the main window', async ({ context, isMobile }) => {
  test.skip(isMobile, 'The presenter view is a laptop screen.');
  const main = await context.newPage();
  await go(main, '/walkthrough/signal');
  await expect(main.getByTestId('scene-signal')).toBeVisible();
  const presenter = await context.newPage();
  await presenter.goto(`${BASE}/presenter?notrack=1`);
  await expect(presenter.getByTestId('presenter-status')).toHaveAttribute('data-on', 'true', { timeout: 10_000 });
  await presenter.getByRole('button', { name: /Build vs buy/ }).click();
  // The presentation keeps its place in the query (?tour=…), so match the path only.
  await expect(main).toHaveURL(/\/backup\/build-vs-buy(\?|$)/);
  await expect(main.getByTestId('backup-page')).toHaveAttribute('data-topic', 'build-vs-buy');
});
