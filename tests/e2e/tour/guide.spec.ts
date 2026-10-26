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
  test('spans the full width at the bottom, and the sidebar ends above it', async ({ page }) => {
    test.skip(phone(page), 'phones use the bottom sheet');
    await go(page, '/app/overview');
    const g = await box(guide(page));
    const vp = page.viewportSize()!;
    expect(Math.round(g.x)).toBe(0);
    expect(Math.round(g.width)).toBe(vp.width);
    expect(Math.round(g.y + g.height)).toBe(vp.height);
    const side = await box(page.locator('.ds-sidebar'));
    expect(side.y + side.height).toBeLessThanOrEqual(g.y + 1);
    await expect(page.getByTestId('guide-tag')).toBeVisible();
  });

  test('the target ring is green and animated, and the control keeps no second outline', async ({ page }) => {
    await go(page, '/app/review?tour=review.approve');
    await expectGuideOn(page, 'review.approve');
    const ring = page.getByTestId('guide-ring');
    await expect(ring).toBeVisible();
    const border = await ring.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(border).toBe('rgb(0, 132, 99)');
    const pulse = await ring.evaluate((el) => getComputedStyle(el, '::after').animationName);
    expect(pulse).toBe('t-ring-pulse');
    const outline = await page.locator('[data-tour="review.approve"]').first().evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('none');
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
