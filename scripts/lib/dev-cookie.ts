/** Print the hb_invoca password cookie for local API testing: node scripts/lib/dev-cookie.ts */
import { passwordToken } from '../../src/worker/gate.ts';
import { loadEnv } from '../env.ts';
const env = loadEnv();
console.log(`hb_invoca=${await passwordToken(env.INVOCA_PASSWORD!)}`);
