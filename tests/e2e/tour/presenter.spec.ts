import { expect, test } from '@playwright/test';
import { BASE, expectStep, go } from './helpers';

test('presenter view syncs with the main window and drives it', async ({ context }) => {
  const main = await context.newPage();
  await go(main, '/walkthrough/black-hole');
  await expectStep(main, 'black-hole');

  const presenter = await context.newPage();
  await presenter.goto(`${BASE}/presenter?notrack=1`);
  await expect(presenter.getByTestId('presenter-status')).toHaveAttribute('data-on', 'true', { timeout: 10_000 });
  await expect(presenter.getByTestId('pv-current')).toContainText('black hole');
  await expect(presenter.getByTestId('pv-notes')).toBeVisible();

  // remote next: advances a beat on the main window
  await presenter.getByTestId('pv-next').click();
  await expect(main.getByTestId('scene-black-hole')).toHaveAttribute('data-beat', '1');

  // main window moves → presenter follows
  await main.keyboard.press('ArrowRight');
  await main.keyboard.press('ArrowRight');
  await expectStep(main, 'why');
  await expect(presenter.getByTestId('pv-current')).toContainText('Why this option');

  // jump list
  await presenter.getByRole('button', { name: /Prove it/ }).click();
  await expectStep(main, 'ch7.metrics');
});
