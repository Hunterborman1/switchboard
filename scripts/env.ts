/** Load .env and map the Cloudflare write credentials onto wrangler's variable names. */
import { readFileSync } from 'node:fs';

export function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  process.env.CLOUDFLARE_API_TOKEN ||= out.CLOUDFLARE_WRITE_API_KEY ?? '';
  process.env.CLOUDFLARE_ACCOUNT_ID ||= out.CLOUDFLARE_WRITE_ACCOUNT_ID ?? '';
  return out;
}
