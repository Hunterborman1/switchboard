import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

/**
 * One Playwright config for every e2e layer: `npx playwright test` runs them all.
 *
 * - `app`: product UI specs (tests/e2e/app) against the fixture-mode dev harness
 *   (VITE_FIXTURES=1, src/app/dev/index.html, hash routing). No Worker needed.
 * - `tour-desktop` / `tour-mobile`: the walkthrough (tests/e2e/tour) on the real router, over
 *   the fixture-mode product.
 * - `platform-desktop` / `platform-tablet` / `platform-mobile`: Agent Ops (tests/e2e/platform)
 *   against the real Worker (wrangler dev on :8812, local D1 in .wrangler/ao-e2e, migrated and
 *   seeded with the simulated history) behind the real SPA (vite on :5192, proxying the API).
 *
 * The Worker + platform vite servers only start when a platform project is selected (all
 * projects by default), so `--project app` stays fast.
 */
const APP_PORT = Number(process.env.APP_E2E_PORT ?? 5179);
// Overridable so a second checkout can run the suite while another holds the defaults.
const PLATFORM_PORT = Number(process.env.PLATFORM_E2E_PORT ?? 5192);
const PLATFORM_WORKER_PORT = Number(process.env.PLATFORM_E2E_WORKER_PORT ?? 8812);
const PERSIST = '.wrangler/ao-e2e';

function selectedProjects(): string[] {
  const out: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--project' && argv[i + 1]) out.push(argv[++i]!);
    else if (a.startsWith('--project=')) out.push(a.slice('--project='.length));
  }
  return out;
}
const selected = selectedProjects();
const wantsPlatform = selected.length === 0 || selected.some((p) => p.startsWith('platform') || p.includes('*'));

const appServer: NonNullable<PlaywrightTestConfig['webServer']> = {
  command: `npx vite --port ${APP_PORT} --strictPort`,
  env: { VITE_FIXTURES: '1' },
  url: `http://localhost:${APP_PORT}/repo/invoca/src/app/dev/index.html`,
  reuseExistingServer: true,
  timeout: 60_000,
};
const platformServers: NonNullable<PlaywrightTestConfig['webServer']>[] = [
  {
    command: `npx wrangler d1 migrations apply invoca-signal-loop --local --persist-to ${PERSIST} && node scripts/platform/seed.ts --local --persist-to ${PERSIST} && npx wrangler dev --port ${PLATFORM_WORKER_PORT} --ip 127.0.0.1 --persist-to ${PERSIST}`,
    url: `http://127.0.0.1:${PLATFORM_WORKER_PORT}/repo/invoca/login`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  {
    command: 'npx vite --config tests/e2e/platform/vite.config.ts',
    url: `http://localhost:${PLATFORM_PORT}/repo/invoca/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
];

const platformUse = { baseURL: `http://localhost:${PLATFORM_PORT}`, trace: 'retain-on-failure' as const, reducedMotion: 'reduce' as const };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  // One vite dev server (and one wrangler dev) serve every worker; more parallelism than this
  // turns into timing flakes on the long walkthrough specs.
  workers: Number(process.env.E2E_WORKERS ?? 6),
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
    // Agent Ops against the real Worker. Serial within a file and capped at 2 workers: the
    // specs share one seeded local D1 behind one wrangler dev.
    {
      name: 'platform-desktop',
      testDir: 'tests/e2e/platform',
      testIgnore: /(mobile|tablet)\.spec/,
      timeout: 60_000,
      fullyParallel: false,
      workers: 2,
      expect: { timeout: 15_000 },
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...platformUse },
    },
    {
      name: 'platform-tablet',
      testDir: 'tests/e2e/platform',
      testMatch: /tablet\.spec/,
      timeout: 60_000,
      fullyParallel: false,
      workers: 2,
      expect: { timeout: 15_000 },
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 900 }, ...platformUse },
    },
    {
      name: 'platform-mobile',
      testDir: 'tests/e2e/platform',
      testMatch: /mobile\.spec/,
      timeout: 60_000,
      fullyParallel: false,
      workers: 2,
      expect: { timeout: 15_000 },
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, ...platformUse },
    },
  ],
  webServer: wantsPlatform ? [appServer, ...platformServers] : [appServer],
});
