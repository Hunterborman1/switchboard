/**
 * Write .dev.vars for `wrangler dev` from .env. Local dev uses the BUILD key as
 * OPENROUTER_API_KEY (never the runtime or management key).
 *   node scripts/lib/dev-vars.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../env.ts';
import { ROOT } from './data.ts';

const env = loadEnv();
const vars: Record<string, string | undefined> = {
  INVOCA_PASSWORD: env.INVOCA_PASSWORD,
  LINK_SIGNING_SECRET: env.LINK_SIGNING_SECRET,
  SITE_PASSWORD: env.SITE_PASSWORD,
  OPENROUTER_API_KEY: env.OPENROUTER_BUILD_KEY,
  VECTOR_MODE: 'd1',
};
const body = Object.entries(vars).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
writeFileSync(join(ROOT, '.dev.vars'), body);
console.log(`[dev-vars] wrote .dev.vars (${Object.keys(vars).filter((k) => vars[k]).join(', ')})`);
