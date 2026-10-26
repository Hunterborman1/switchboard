/** The Guide is docked and covers nothing: the page, sticky bars and dialogs keep clear of it. */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectGuideOn, go, guide } from './helpers';

const phone = (page: Page) => (page.viewportSize()?.width ?? 0) <= 900;

async function box(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('not on screen');
  return b;
}

test.describe('the docked Guide', () => {
  test('sits along the bottom of the content column, never over the sidebar', async ({ page }) => {
    test.skip(phone(page), 'phones use the bottom sheet');
    await go(page, '/app/overview');
    const g = await box(guide(page));
    const vp = page.viewportSize()!;
    const main = await box(page.locator('#main-content'));
    expect(Math.round(g.y + g.height)).toBe(vp.height);
    expect(Math.round(g.x)).toBe(Math.round(main.x));
    expect(Math.round(g.x + g.width)).toBe(vp.width);
  });

  test('the review decision bar rides above it, fully visible', async ({ page }) => {
    await go(page, '/app/review?tour=review.approve');
    await expectGuideOn(page, 'review.approve');
    const bar = page.locator('[data-tour="review.approve"]').locator('xpath=ancestor::*[contains(@class,"ds-card__footer")]');
    const decision = await box(bar);
    const g = await box(guide(page));
    expect(decision.y + decision.height).toBeLessThanOrEqual(g.y + 1);
  });

  test('a dialog folds it to a strip and is centred in the space above it', async ({ page }) => {
    test.skip(phone(page), 'phones fold the sheet to its bar');
    await go(page, '/app/new?tour=call.pick');
    await expectGuideOn(page, 'call.pick');
    await page.getByRole('button', { name: 'Browse conversations' }).click();
    const dialog = page.locator('.ds-dialog');
    await expect(dialog).toBeVisible();
    await expect(guide(page)).toHaveAttribute('data-size', 'folded');
    const d = await box(dialog);
    const g = await box(guide(page));
    expect(d.y + d.height).toBeLessThanOrEqual(g.y);
  });
});
