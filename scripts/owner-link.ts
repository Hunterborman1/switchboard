/**
 * Print the owner sign-in URL (?owner=<OWNER_TOKEN>). Opening it sets the owner cookie
 * (hb_invoca_owner) and strips the token from the address bar. Treat the output as a secret.
 *   node scripts/owner-link.ts [baseUrl]
 */
import { ensureOwnerToken, loadEnv } from './env.ts';

ensureOwnerToken();
const env = loadEnv();
const base = process.argv[2] ?? 'https://repos.hunterborman.com';
console.log(`${base}/repo/invoca/?owner=${encodeURIComponent(env.OWNER_TOKEN!)}`);
