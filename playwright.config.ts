import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config. Projects:
 * - `app`: product UI specs (tests/e2e/app) against the fixture-mode dev harness
 *   (VITE_FIXTURES=1, src/app/dev/index.html, hash routing). No Worker needed.
 * - `tour-desktop` / `tour-mobile`: the walkthrough (tests/e2e/tour) on the real router.
 * Other layers (platform) can add their own project here.
 */
const APP_PORT = Number(process.env.APP_E2E_PORT ?? 5179);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'app',
      testDir: 'tests/e2e/app',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${APP_PORT}` },
    },
    // Walkthrough (tests/e2e/tour): the real router at /repo/invoca/ over the fixture-mode product.
    {
      name: 'tour-desktop',
      testDir: 'tests/e2e/tour',
      timeout: 150_000,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://localhost:${APP_PORT}` },
    },
    {
      name: 'tour-mobile',
      testDir: 'tests/e2e/tour',
      testMatch: /(scenes|state)\.spec\.ts/,
      timeout: 150_000,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, baseURL: `http://localhost:${APP_PORT}` },
    },
  ],
  webServer: {
    command: `npx vite --port ${APP_PORT} --strictPort`,
    env: { VITE_FIXTURES: '1' },
    url: `http://localhost:${APP_PORT}/repo/invoca/src/app/dev/index.html`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
