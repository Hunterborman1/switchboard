/** Load .env and map the Cloudflare write credentials onto wrangler's variable names. */
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

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

/** Add a random OWNER_TOKEN (32 bytes, base64url) to .env if it has none. Never prints it. */
export function ensureOwnerToken(): void {
  const path = new URL('../.env', import.meta.url);
  const text = readFileSync(path, 'utf8');
  if (/^OWNER_TOKEN=.{32,}\r?$/m.test(text)) return;
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  appendFileSync(path, `${text.endsWith('\n') ? '' : nl}OWNER_TOKEN=${randomBytes(32).toString('base64url')}${nl}`);
  console.log('[env] generated OWNER_TOKEN in .env');
}
