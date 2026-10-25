/**
 * Agent Ops end-to-end: the real Worker (local D1 in .wrangler/ao-e2e, migrated and seeded with
 * the simulated history) behind the real SPA.
 *
 *   npx playwright test -c tests/e2e/platform/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

const PERSIST = '.wrangler/ao-e2e';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5192', trace: 'retain-on-failure', reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', testIgnore: /(mobile|tablet)\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', testMatch: /tablet\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 900 } } },
    { name: 'mobile', testMatch: /mobile\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: `npx wrangler d1 migrations apply invoca-signal-loop --local --persist-to ${PERSIST} && node scripts/platform/seed.ts --local --persist-to ${PERSIST} && npx wrangler dev --port 8812 --ip 127.0.0.1 --persist-to ${PERSIST}`,
      cwd: '../../..',
      url: 'http://127.0.0.1:8812/repo/invoca/login',
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: 'npx vite --config tests/e2e/platform/vite.config.ts',
      cwd: '../../..',
      url: 'http://localhost:5192/repo/invoca/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
