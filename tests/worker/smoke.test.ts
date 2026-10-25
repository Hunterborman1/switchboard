import { createTestHarness } from 'wrangler';
import { it, expect, beforeAll, afterAll } from 'vitest';
const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { INVOCA_PASSWORD: 'pw' } }] });
beforeAll(async () => { await server.listen(); await server.getWorker().applyD1Migrations('DB'); });
afterAll(async () => { await server.close(); });
it('boots', async () => {
  const r = await server.fetch('https://repos.hunterborman.com/repo/invoca/api/ping');
  expect(r.status).toBe(401);
  const env = await server.getWorker().getEnv();
  const row = await env.DB.prepare('select count(*) n from revoked_links').first();
  expect(row.n).toBe(0);
});
