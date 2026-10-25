import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
export default defineConfig({
  plugins: [cloudflareTest({ remoteBindings: false, miniflare: { compatibilityDate: '2026-08-15', compatibilityFlags: ['nodejs_compat'], bindings: { INVOCA_PASSWORD: 'pw' } } })],
  test: { include: ['tests/worker/bare.test.ts'] },
});
