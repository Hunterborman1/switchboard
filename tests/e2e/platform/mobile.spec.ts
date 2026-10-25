import { expect, test } from '@playwright/test';
import { anchor, noHorizontalScroll, open, signIn } from './helpers';

test.beforeEach(async ({ context }) => signIn(context));

const PAGES = ['/ops', '/ops/agents', '/ops/agents/agt_signal_loop', '/ops/usage', '/ops/logs', '/ops/reliability', '/ops/cost', '/ops/standard', '/ops/standard/reviews', '/ops/standard/checklist', '/ops/summary'];

for (const path of PAGES) {
  test(`mobile renders slim, without horizontal scroll: ${path}`, async ({ page }) => {
    await open(page, path);
    await noHorizontalScroll(page);
  });
}

test('mobile: drawer navigation works and secondary columns are hidden', async ({ page }) => {
  await open(page, '/ops');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Primary navigation' }).getByRole('link', { name: 'Agent registry' }).click();
  await expect(page).toHaveURL(/\/ops\/agents/);
  await expect(anchor(page, 'ops.registry').getByRole('columnheader', { name: /30d cost/ })).toBeHidden();
  await anchor(page, 'ops.registry.signal').getByRole('link', { name: 'Signal Loop' }).click();
  await expect(anchor(page, 'ops.agent.standard')).toBeVisible();
});
