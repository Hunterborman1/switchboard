import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const BASE = '/repo/invoca';

/** Open a walkthrough-router path with telemetry off. */
export async function go(page: Page, path: string) {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${BASE}${path}${sep}notrack=1`);
}

export const callout = (page: Page) => page.getByTestId('tour-callout');

export async function currentStep(page: Page): Promise<string | null> {
  const url = new URL(page.url());
  return url.searchParams.get('tour');
}

export async function expectStep(page: Page, id: string | RegExp, timeout = 15_000) {
  await expect.poll(() => currentStep(page), { timeout }).toMatch(typeof id === 'string' ? new RegExp(`^${id.replace('.', '\\.')}$`) : id);
}

/**
 * The file that leads to each branch, read from the data the picker shows
 * (data/tour-files.json → data/library.json), so the tests follow the library.
 */
type Lib = { id: string; filename: string; tourPath: string | null; featured: boolean };
function loadBranchFiles(): Record<string, string[]> {
  const root = process.cwd();
  const read = <T,>(f: string): T | null => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')) as T;
    } catch {
      return null;
    }
  };
  const raw = read<Lib[] | { files: Lib[] }>('data/library.json');
  const lib: Lib[] = Array.isArray(raw) ? raw : raw?.files ?? [];
  const tour = read<Record<string, string>>('data/tour-files.json') ?? {};
  const out: Record<string, string[]> = {};
  for (const p of ['main', 'clean', 'messy', 'security', 'negative', 'privacy']) {
    const pinned = lib.find((f) => f.id === tour[p]);
    const others = lib.filter((f) => f.featured && f.tourPath === p && f.id !== tour[p]);
    out[p] = [pinned, ...others].filter((f): f is Lib => !!f).map((f) => f.filename);
  }
  return out;
}
export const BRANCH_FILES = loadBranchFiles();

/** Ch1: open the picker from the tour, choose a file for `branch`, open it, and press Run. */
export async function pickAndRun(page: Page, branch: string) {
  await expectStep(page, 'ch1.intro');
  await page.locator('[data-tour="new.upload"]').first().click();
  await expectStep(page, 'ch1.pick');
  const dialog = page.locator('[data-tour="picker.dialog"]');
  await expect(dialog).toBeVisible();
  if (branch === 'main') {
    await page.locator('[data-tour="picker.recommended"]').click();
  } else {
    const search = dialog.getByPlaceholder(/search/i);
    let picked = false;
    for (const term of BRANCH_FILES[branch] ?? []) {
      await search.fill(term);
      const opt = dialog.getByRole('option').filter({ hasText: term }).first();
      const ok = await opt.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false);
      if (ok) {
        await opt.click();
        picked = true;
        break;
      }
    }
    expect(picked, `a file for branch ${branch}`).toBe(true);
  }
  await page.locator('[data-tour="picker.open"]').click();
  await expectStep(page, 'ch1.run');
  await page.locator('[data-tour="new.run"]').first().click();
  await expectStep(page, /^ch2\./);
}

/**
 * Drive the tour forward until `until` matches the current step: presses Continue / Skip
 * in the callout, or performs the product action an event step is waiting on.
 */
export async function advanceUntil(page: Page, until: RegExp, opts: { seen?: string[]; max?: number } = {}) {
  const seen = opts.seen ?? [];
  for (let i = 0; i < (opts.max ?? 40); i++) {
    const step = (await currentStep(page)) ?? '';
    if (!seen.includes(step)) seen.push(step);
    if (until.test(step)) return seen;
    const c = callout(page);
    await c.waitFor({ state: 'visible', timeout: 15_000 });
    const choice = c.getByRole('button', { name: /^Continue/ });
    const skip = c.getByRole('button', { name: /^Skip/ });
    // dispatch directly: the callout may still be gliding after its target while the run view animates
    // Bounded: a button re-rendered between the check and the click must not hang the test until
    // its timeout; the loop re-reads the step and tries again.
    const click = (b: typeof choice) => b.dispatchEvent('click', undefined, { timeout: 4_000 }).then(() => true, () => false);
    if (await choice.isVisible().catch(() => false)) await click(choice);
    else if (await skip.isVisible().catch(() => false)) await click(skip);
    else await page.keyboard.press('ArrowRight');
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).not.toBe(step).catch(() => {});
  }
  throw new Error(`never reached ${until} (seen: ${seen.join(' → ')})`);
}
