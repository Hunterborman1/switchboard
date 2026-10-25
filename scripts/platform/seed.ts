/**
 * Seed the Agent Ops database (D1 'invoca-agent-ops') with the simulated history.
 *
 *   node scripts/platform/seed.ts --local                 migrate + seed the local D1 (wrangler dev)
 *   node scripts/platform/seed.ts --remote                migrate + seed production (Cloudflare creds from .env)
 *   node scripts/platform/seed.ts --local --end 2026-10-31   end the six-week window on another date
 *   node scripts/platform/seed.ts --local --persist-to <dir>  seed a wrangler dev started with --persist-to <dir>
 *   node scripts/platform/seed.ts --dry                   write the SQL only
 *
 * Re-runnable: it replaces simulated rows and registry rows, and never touches live rows
 * (real Signal Loop telemetry and demo viewers). SQL lands in .wrangler/platform-seed/.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { simulate, type SimOutput } from './simulate.ts';

const DB_NAME = 'invoca-agent-ops';
const ROWS_PER_INSERT = 40;
const STATEMENTS_PER_FILE = 350;

function q(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return `'${s.replace(/'/g, "''")}'`;
}

function inserts(table: string, cols: string[], rows: unknown[][]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT).map((r) => `(${r.map(q).join(',')})`);
    out.push(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES ${chunk.join(',')};`);
  }
  return out;
}

/** Every statement needed to replace the simulated data set. Also used by the worker tests. */
export function buildSeedStatements(sim: SimOutput, seededAt = new Date().toISOString()): string[] {
  const s: string[] = [
    "DELETE FROM usage_events WHERE source = 'simulated';",
    "DELETE FROM logs WHERE source = 'simulated';",
    "DELETE FROM spans WHERE source = 'simulated';",
    "DELETE FROM work_units WHERE source = 'simulated';",
    'DELETE FROM changelog;',
    'DELETE FROM alerts;',
    'DELETE FROM agents;',
    'DELETE FROM people;',
    "DELETE FROM meta WHERE key IN ('sim_from','sim_to','seeded_at','rolled_days','seed_version');",
  ];
  s.push(
    ...inserts(
      'meta',
      ['key', 'value'],
      [
        ['sim_from', sim.window.from],
        ['sim_to', sim.window.to],
        ['seeded_at', seededAt],
        ['rolled_days', '0'],
        ['seed_version', 'agent-ops-v2'],
      ],
    ),
  );
  s.push(
    ...inserts(
      'agents',
      ['id', 'sort', 'record', 'profile', 'last_review', 'next_review', 'launched_at', 'updated_at'],
      sim.agents.map((a, i) => {
        const { lastReview, nextReview, launchedAt, ...rest } = a.record;
        return [a.record.id, i, rest, a.profile, lastReview, nextReview, launchedAt, seededAt];
      }),
    ),
  );
  s.push(...inserts('people', ['id', 'name', 'role', 'department', 'title'], sim.people.map((p) => [p.id, p.name, p.role, p.department, p.title])));
  s.push(...inserts('changelog', ['id', 'agent_id', 'at', 'kind', 'title', 'detail', 'actor', 'ref', 'source'], sim.changelog.map((c) => [c.id, c.agentId, c.at, c.kind, c.title, c.detail, c.actor, c.ref, 'simulated'])));
  s.push(...inserts('alerts', ['id', 'agent_id', 'at', 'severity', 'rule', 'expected', 'actual', 'status', 'owner', 'runbook', 'trace_id', 'resolved_at'], sim.alerts.map((a) => [a.id, a.agentId, a.at, a.severity, a.rule, a.expected, a.actual, a.status, a.owner, a.runbook, a.traceId, a.resolvedAt])));
  s.push(...inserts('usage_events', ['id', 'agent_id', 'source', 'session_id', 'actor_id', 'actor_role', 'kind', 'path', 'props', 'at', 'duration_ms'], sim.events.map((e) => [e.id, e.agentId, e.source, e.sessionId, e.actorId, e.actorRole, e.kind, e.path, e.props, e.at, e.durationMs])));
  s.push(...inserts('work_units', ['id', 'agent_id', 'source', 'at', 'kind', 'actor_id', 'minutes_saved', 'human_minutes', 'ai_cost_usd', 'outcome'], sim.work.map((w) => [w.id, w.agentId, w.source, w.at, w.kind, w.actorId, w.minutesSavedEstimate, w.humanMinutesSpent, w.aiCostUsd, w.outcome])));
  s.push(...inserts('logs', ['id', 'agent_id', 'source', 'at', 'level', 'component', 'event', 'message', 'trace_id', 'span_id', 'run_id', 'workspace_id', 'duration_ms', 'fields'], sim.logs.map((l) => [l.id, l.agentId, l.source, l.at, l.level, l.component, l.event, l.message, l.traceId, l.spanId, l.runId, l.workspaceId, l.durationMs, l.fields])));
  s.push(...inserts('spans', ['trace_id', 'span_id', 'parent_id', 'agent_id', 'source', 'name', 'start', 'duration_ms', 'status', 'attrs'], sim.spans.map((x) => [x.traceId, x.spanId, x.parentId, x.agentId, x.source, x.name, x.start, x.durationMs, x.status, x.attrs])));
  return s;
}

// ---------------------------------------------------------------- CLI

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/platform/seed.ts');
if (isMain) {
  const args = process.argv.slice(2);
  const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null;
  const dry = args.includes('--dry') || !target;
  const persistIdx = args.indexOf('--persist-to');
  const persist = persistIdx >= 0 && target === '--local' ? ['--persist-to', args[persistIdx + 1]!] : [];
  const endIdx = args.indexOf('--end');
  const end = endIdx >= 0 ? args[endIdx + 1] : undefined;
  if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    console.error('--end must be YYYY-MM-DD');
    process.exit(1);
  }
  if (target === '--remote') {
    const { loadEnv } = await import('../env.ts');
    loadEnv();
  }
  const sim = simulate({ end });
  const statements = buildSeedStatements(sim);
  const dir = new URL('../../.wrangler/platform-seed/', import.meta.url);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (let i = 0; i < statements.length; i += STATEMENTS_PER_FILE) {
    const name = `seed-${String(files.length).padStart(3, '0')}.sql`;
    writeFileSync(new URL(name, dir), statements.slice(i, i + STATEMENTS_PER_FILE).join('\n') + '\n');
    files.push(name);
  }
  const rows = sim.events.length + sim.logs.length + sim.spans.length + sim.work.length + sim.changelog.length + sim.alerts.length + sim.agents.length + sim.people.length;
  console.log(`[platform:seed] window ${sim.window.from} → ${sim.window.to} · ${rows.toLocaleString()} rows · ${statements.length} statements in ${files.length} files`);
  if (dry) {
    console.log(`[platform:seed] dry run: SQL written to .wrangler/platform-seed/ (pass --local or --remote to apply)`);
    process.exit(0);
  }
  const win = process.platform === 'win32';
  const run = (cmdArgs: string[]) => {
    const r = spawnSync('npx', cmdArgs, { stdio: 'inherit', shell: win });
    if (r.status !== 0) {
      console.error(`[platform:seed] failed: npx ${cmdArgs.join(' ')}`);
      process.exit(r.status ?? 1);
    }
  };
  run(['wrangler', 'd1', 'migrations', 'apply', DB_NAME, target, ...persist]);
  for (const f of files) {
    console.log(`[platform:seed] applying ${f}`);
    run(['wrangler', 'd1', 'execute', DB_NAME, target, ...persist, '--yes', '--file', `.wrangler/platform-seed/${f}`]);
  }
  console.log('[platform:seed] done');
}
