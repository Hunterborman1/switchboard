/**
 * Build, check, migrate both D1 databases (Signal Loop + Agent Ops), sync secrets, deploy.
 *   node scripts/deploy.ts            full deploy
 *   node scripts/deploy.ts --no-secrets
 */
import { spawnSync } from 'node:child_process';
import { loadEnv } from './env.ts';

const env = loadEnv();
const win = process.platform === 'win32';

function run(cmd: string, args: string[], input?: string): void {
  const r = spawnSync(cmd, args, { stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'], input, shell: win });
  if (r.status !== 0) {
    console.error(`[deploy] failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

run('npm', ['run', 'build']);
run('npm', ['run', 'typecheck']);
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'invoca-signal-loop', '--remote']);
// Agent Ops has its own database (PLATFORM_DB, migrations-platform/).
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'invoca-agent-ops', '--remote']);

if (!process.argv.includes('--no-secrets')) {
  const secrets: Record<string, string | undefined> = {
    INVOCA_PASSWORD: env.INVOCA_PASSWORD,
    LINK_SIGNING_SECRET: env.LINK_SIGNING_SECRET,
    SITE_PASSWORD: env.SITE_PASSWORD,
    OPENROUTER_API_KEY: env.OPENROUTER_RUNTIME_KEY,
  };
  const bulk = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v));
  run('npx', ['wrangler', 'secret', 'bulk'], JSON.stringify(bulk));
}

run('npx', ['wrangler', 'deploy']);
console.log('[deploy] done → https://repos.hunterborman.com/repo/invoca/');
