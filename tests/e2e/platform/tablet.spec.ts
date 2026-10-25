import { expect, test } from '@playwright/test';
import { noHorizontalScroll, open, signIn } from './helpers';

test.beforeEach(async ({ context }) => signIn(context));

const PAGES = ['/ops', '/ops/agents', '/ops/agents/agt_signal_loop', '/ops/usage', '/ops/logs', '/ops/reliability', '/ops/cost', '/ops/standard', '/ops/standard/reviews', '/ops/summary'];

for (const path of PAGES) {
  test(`tablet keeps the desktop layout without horizontal scroll: ${path}`, async ({ page }) => {
    await open(page, path);
    await expect(page.getByTestId('console-sidebar')).toBeVisible();
    await noHorizontalScroll(page);
  });
}
