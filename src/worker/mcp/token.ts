/**
 * MCP access tokens: `swb_<payload>.<sig>`. The payload is base64url JSON {ws, exp, jti}, signed
 * with HMAC-SHA256 under a key derived from LINK_SIGNING_SECRET. A token reads and writes one
 * workspace only. Revoke one by adding its jti to `revoked_links`; rotate the secret to revoke all.
 */
import { b64url, fromB64url, hmac, safeEqual } from '../gate.ts';

const PREFIX = 'swb_';
const enc = new TextEncoder();
const dec = new TextDecoder();

export type McpClaims = { ws: string; exp: number; jti: string };

const key = (secret: string) => `mcp-token|${secret}`;

export async function issueMcpToken(claims: McpClaims, secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  const sig = b64url(new Uint8Array(await hmac(key(secret), payload)));
  return `${PREFIX}${payload}.${sig}`;
}

/** The claims of a valid, unexpired token, or null. Never throws on malformed input. */
export async function verifyMcpToken(token: string, secret: string | undefined, now: number): Promise<McpClaims | null> {
  if (!secret || !token.startsWith(PREFIX)) return null;
  const [payload, sig] = token.slice(PREFIX.length).split('.');
  if (!payload || !sig) return null;
  const expected = b64url(new Uint8Array(await hmac(key(secret), payload)));
  if (!(await safeEqual(sig, expected))) return null;
  try {
    const c = JSON.parse(dec.decode(fromB64url(payload))) as Partial<McpClaims>;
    if (typeof c.ws !== 'string' || !/^ws_[a-f0-9]{16}$/.test(c.ws) || typeof c.exp !== 'number' || typeof c.jti !== 'string') return null;
    return c.exp > now ? { ws: c.ws, exp: c.exp, jti: c.jti } : null;
  } catch {
    return null;
  }
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1]! : null;
}
