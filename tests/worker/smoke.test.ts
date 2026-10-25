import { env, exports } from 'cloudflare:workers';
import { it, expect } from 'vitest';
it('boots', async () => {
  const r = await (exports as any).default.fetch('https://repos.hunterborman.com/repo/invoca/api/ping');
  expect(r.status).toBe(401);
  expect((env as any).INVOCA_PASSWORD).toBe('pw');
});
