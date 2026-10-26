import { expect, test } from '@playwright/test';
import { BASE, expectStep, go } from './helpers';

test('presenter view syncs with the main window and drives it', async ({ context }) => {
  const main = await context.newPage();
  await go(main, '/walkthrough/built');
  await expectStep(main, 'built');

  const presenter = await context.newPage();
  await presenter.goto(`${BASE}/presenter?notrack=1`);
  await expect(presenter.getByTestId('presenter-status')).toHaveAttribute('data-on', 'true', { timeout: 10_000 });
  await expect(presenter.getByTestId('pv-current')).toContainText('What I built, and why.');
  await expect(presenter.getByText('Chapter 3 of 10').first()).toBeVisible();
  await expect(presenter.getByTestId('pv-notes')).toBeVisible();

  // remote next: the main window moves to the next scene (a scene is one step)
  await presenter.getByTestId('pv-next').click();
  await expectStep(main, 'call.platform');
  await expect(main.getByTestId('scene-platform')).toBeVisible();

  // main window moves → presenter follows
  await main.keyboard.press('ArrowRight');
  await expectStep(main, 'call.intro');
  await expect(presenter.getByTestId('pv-current')).toContainText('Bring in today’s call');

  // jump list, in the same order and numbering as the chapter rail
  await presenter.getByRole('button', { name: /Right owner, right channel/ }).first().click();
  await expectStep(main, 'routing.rule');
});
