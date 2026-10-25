/** Issue a signed access link. node scripts/sign-link.ts [days=7] */
import { randomUUID } from 'node:crypto';
import { signLink } from '../src/worker/gate.ts';
import { loadEnv } from './env.ts';

const env = loadEnv();
const days = Number(process.argv[2] ?? 7);
const iat = Math.floor(Date.now() / 1000);
const exp = iat + Math.round(days * 86400);
const jti = randomUUID();
const token = await signLink(env.LINK_SIGNING_SECRET!, { aud: 'invoca', exp, iat, jti });
console.log(JSON.stringify({ url: `https://repos.hunterborman.com/repo/invoca/?k=${token}`, expiresAt: new Date(exp * 1000).toISOString(), jti }, null, 2));
