/**
 * Remove live Agent Ops rows that came from automated test runs (scripted API calls, Playwright
 * walkthroughs) rather than from people, so Overview/Usage count real viewers only.
 *
 *   node scripts/platform/cleanup-test-workspaces.ts --local            dry run: classify and count
 *   node scripts/platform/cleanup-test-workspaces.ts --remote           dry run against production
 *   node scripts/platform/cleanup-test-workspaces.ts --remote --apply   delete, then count again
 *
 * What a live viewer leaves behind (PLATFORM_DB, source = 'live'):
 *   usage_events.actor_id  'viewer:<first 6 hex of the ws id>' (or 'owner')
 *   work_units.actor_id    same actor id
 *   logs.workspace_id      the full 'ws_<16 hex>' workspace id (every API request logs one row,
 *                          with fields.via = password | link | owner)
 *   spans                  request spans carry attrs.workspace; run spans share the run's trace
 *
 * A live actor is treated as a test only when ALL of these hold:
 *   1. every API request of its workspace authenticated with the shared password: never the owner
 *      cookie (Hunter) and never a signed link (the panel), and
 *   2. at least one automation signature:
 *      a. no browser session at all: API calls but no client 'session_start' event (a browser
 *         always posts session_start when the app loads), or
 *      b. machine cadence: 8+ tour steps whose median gap is under 3.5 s, or
 *      c. a parallel launch: its session_start lands within 250 ms of another workspace's.
 * Anything else is kept. Simulated rows are never touched. The Signal Loop DB is not touched
 * either: its ai_calls rows are the spend ledger behind the $15 budget, and per-workspace runs
 * are only ever visible to that workspace.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const DB = 'invoca-agent-ops';
const args = process.argv.slice(2);
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null;
const apply = args.includes('--apply');
/** --also viewer:abc123,viewer:def456 marks known test actors the heuristics would keep. */
const alsoIdx = args.indexOf('--also');
const also = new Set(alsoIdx >= 0 ? args[alsoIdx + 1]!.split(',') : []);
const persistIdx = args.indexOf('--persist-to');
const persist = persistIdx >= 0 ? ['--persist-to', args[persistIdx + 1]!] : [];
if (!target) {
  console.error('usage: node scripts/platform/cleanup-test-workspaces.ts --local|--remote [--apply]');
  process.exit(1);
}
if (target === '--remote') {
  const { loadEnv } = await import('../env.ts');
  loadEnv(); // sets CLOUDFLARE_API_TOKEN / ACCOUNT_ID for wrangler; values are never printed
}

const win = process.platform === 'win32';
function wrangler(extra: string[]): string {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', DB, target!, ...persist, ...extra], { shell: win, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-2000) || r.stdout?.slice(-2000));
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}
/** Read query. `--command` (not `--file`): a remote --file run is an import and returns no rows. */
function query<T>(sql: string): T[] {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  if (oneLine.includes('"')) throw new Error('queries must not contain double quotes');
  const out = wrangler(['--json', '--command', win ? `"${oneLine}"` : oneLine]);
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as { results: T[] }[];
  return parsed.flatMap((p) => p.results ?? []);
}

type Actor = { actor_id: string; sessions: number; session_starts: number; first_start: string | null; steps: string | null };
type Ws = { workspace_id: string; vias: string };

const actors = query<Actor>(`
  SELECT actor_id,
         count(DISTINCT session_id) AS sessions,
         sum(kind = 'session_start') AS session_starts,
         min(CASE WHEN kind = 'session_start' THEN at END) AS first_start,
         group_concat(CASE WHEN kind = 'tour_step' THEN at END, ',') AS steps
  FROM usage_events WHERE source = 'live' AND actor_id LIKE 'viewer:%' GROUP BY actor_id;`);
const wsRows = query<Ws>(`
  SELECT workspace_id, group_concat(DISTINCT json_extract(fields, '$.via')) AS vias
  FROM logs WHERE source = 'live' AND event = 'http.request' AND workspace_id LIKE 'ws_%' GROUP BY workspace_id;`);

const starts = actors.filter((a) => a.first_start).map((a) => ({ id: a.actor_id, t: Date.parse(a.first_start!) }));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : Infinity;
};

type Verdict = { actor: string; workspaces: string[]; test: boolean; why: string };
const verdicts: Verdict[] = actors.map((a) => {
  const prefix = `ws_${a.actor_id.slice('viewer:'.length)}`;
  const ws = wsRows.filter((w) => w.workspace_id.startsWith(prefix));
  const vias = new Set(ws.flatMap((w) => (w.vias ?? '').split(',').filter(Boolean)));
  const workspaces = ws.map((w) => w.workspace_id);
  if (also.has(a.actor_id)) return { actor: a.actor_id, workspaces, test: true, why: 'named with --also' };
  if (!ws.length) return { actor: a.actor_id, workspaces, test: false, why: 'no request logs to attribute' };
  if ([...vias].some((v) => v !== 'password')) return { actor: a.actor_id, workspaces, test: false, why: `auth via ${[...vias].join('/')}` };
  if (!Number(a.session_starts)) return { actor: a.actor_id, workspaces, test: true, why: 'API only, no browser session' };
  const steps = (a.steps ?? '').split(',').filter(Boolean).map(Date.parse).sort((x, y) => x - y);
  const gaps = steps.slice(1).map((t, i) => (t - steps[i]!) / 1000);
  if (steps.length >= 8 && median(gaps) < 3.5) return { actor: a.actor_id, workspaces, test: true, why: `${steps.length} tour steps, median gap ${median(gaps).toFixed(1)} s` };
  const mine = starts.find((s) => s.id === a.actor_id);
  if (mine && starts.some((s) => s.id !== a.actor_id && Math.abs(s.t - mine.t) <= 250)) return { actor: a.actor_id, workspaces, test: true, why: 'parallel launch with another context' };
  return { actor: a.actor_id, workspaces, test: false, why: 'looks human' };
});

for (const v of verdicts) console.log(`${v.test ? 'TEST' : 'keep'}  ${v.actor.padEnd(15)} ${v.why}`);
const testActors = verdicts.filter((v) => v.test).map((v) => v.actor);
const testWs = verdicts.filter((v) => v.test).flatMap((v) => v.workspaces);

const counts = () =>
  query<Record<string, number>>(`
  SELECT
    (SELECT count(DISTINCT actor_id) FROM usage_events WHERE source = 'live') AS live_actors,
    (SELECT count(*) FROM usage_events WHERE source = 'live') AS live_usage_events,
    (SELECT count(*) FROM work_units WHERE source = 'live') AS live_work_units,
    (SELECT count(*) FROM logs WHERE source = 'live') AS live_logs,
    (SELECT count(*) FROM spans WHERE source = 'live') AS live_spans,
    (SELECT count(DISTINCT actor_id) FROM (SELECT actor_id FROM usage_events UNION SELECT actor_id FROM work_units WHERE actor_id IS NOT NULL)) AS all_actors;`)[0]!;

console.log(`\n${testActors.length} test actors (${testWs.length} workspaces) · ${verdicts.length - testActors.length} kept`);
console.log('before', counts());
if (!apply || !testActors.length) {
  if (!apply) console.log('dry run: pass --apply to delete');
  process.exit(0);
}

const list = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
const A = list(testActors);
const W = list(testWs);
const sql = `
DELETE FROM spans WHERE source = 'live' AND (
  json_extract(attrs, '$.workspace') IN (${W})
  OR trace_id IN (SELECT DISTINCT trace_id FROM logs WHERE source = 'live' AND workspace_id IN (${W}))
);
DELETE FROM logs WHERE source = 'live' AND workspace_id IN (${W});
DELETE FROM usage_events WHERE source = 'live' AND actor_id IN (${A});
DELETE FROM work_units WHERE source = 'live' AND actor_id IN (${A});
DELETE FROM alert_acks WHERE workspace IN (${W});
DELETE FROM assumptions WHERE workspace IN (${W});
`;
const dir = new URL('../../.wrangler/cleanup/', import.meta.url);
writeFileSync(new URL('apply.sql', dir), sql);
wrangler(['--yes', '--file', '.wrangler/cleanup/apply.sql']);
console.log('after ', counts());
