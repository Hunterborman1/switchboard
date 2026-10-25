/**
 * Seed D1 (and Vectorize) from data/**: world, library + raw files, routing rules, taxonomy,
 * replay recordings, backfilled history (workspace 'seed') and eval results. Idempotent: it
 * replaces world/seed rows and never touches viewer workspaces, the runtime AI ledger or the
 * live-budget switch.
 *
 *   node scripts/seed.ts --local            local D1 (wrangler dev)
 *   node scripts/seed.ts --remote           remote D1 + Vectorize upsert
 *   node scripts/seed.ts --local --dry-run  write SQL to .wrangler/seed/ only
 *   [--persist-to <dir>]                    local persistence dir (tests)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Delivery, EvalRun, Insight, Notification, ReviewRecord, RunStep } from '../src/shared/contracts.ts';
import { STEP_KEYS } from '../src/shared/contracts.ts';
import type { LlmCallRow, NewTheme } from '../src/pipeline/types.ts';
import { loadEnv } from './env.ts';
import { DATA, dataReady, loadLibrary, loadWorld, ROOT } from './lib/data.ts';

const args = process.argv.slice(2);
const target = args.includes('--remote') ? 'remote' : 'local';
const dryRun = args.includes('--dry-run');
const persistIdx = args.indexOf('--persist-to');
const persistTo = persistIdx >= 0 ? args[persistIdx + 1] : undefined;
const DB_NAME = 'invoca-signal-loop';
const MAX_STMT = 90_000; // D1 caps a single SQL statement at 100 KB

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const js = (v: unknown) => q(JSON.stringify(v));
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const stmts: string[] = [];
const push = (s: string) => {
  if (s.length > MAX_STMT) throw new Error(`statement too large (${s.length} bytes): ${s.slice(0, 120)}…`);
  stmts.push(s);
};

const world = loadWorld();
const library = loadLibrary();
console.log(`[seed] target=${target} · data READY=${dataReady()} · world=${world.source} · ${library.length} library files`);

// ---------------------------------------------------------------- reset seed-owned rows
for (const t of ['accounts', 'people', 'library_files', 'replays', 'eval_runs']) push(`DELETE FROM ${t};`);
push(`DELETE FROM routing_rules WHERE workspace_id = 'seed';`);
push(`DELETE FROM run_steps WHERE run_id IN (SELECT id FROM runs WHERE workspace_id = 'seed');`);
push(`DELETE FROM transcripts WHERE run_id IN (SELECT id FROM runs WHERE workspace_id = 'seed');`);
for (const t of ['runs', 'insights', 'themes', 'deliveries', 'notifications', 'reviews']) push(`DELETE FROM ${t} WHERE workspace_id = 'seed';`);
push(`DELETE FROM ai_calls WHERE key_scope = 'build';`);

// ---------------------------------------------------------------- world
for (const a of world.accounts) push(`INSERT INTO accounts (id, data) VALUES (${q(a.id)}, ${js(a)});`);
for (const p of world.people) push(`INSERT INTO people (id, data) VALUES (${q(p.id)}, ${js(p)});`);
for (const r of world.rules) push(`INSERT INTO routing_rules (workspace_id, id, priority, data, updated_at) VALUES ('seed', ${q(r.id)}, ${r.priority}, ${js({ ...r, workspaceId: 'seed' })}, ${q(new Date().toISOString())});`);
const now = new Date().toISOString();
push(`INSERT INTO settings (key, value, updated_at) VALUES ('taxonomy', ${js(world.taxonomyRaw)}, ${q(now)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;`);
push(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('prompt_version', '"v4"', ${q(now)});`);
push(`INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('live_enabled', 'true', ${q(now)});`);

// ---------------------------------------------------------------- library + raw files
for (const f of library) {
  const { path: _p, content, ...lf } = f;
  const h = sha(content);
  push(`INSERT OR IGNORE INTO raw_files (sha256, filename, size_bytes, content, created_at) VALUES (${q(h)}, ${q(f.filename)}, ${Buffer.byteLength(content)}, ${q(content)}, ${q(f.modifiedAt)});`);
  push(`INSERT INTO library_files (id, sha256, featured, sort_key, data) VALUES (${q(f.id)}, ${q(h)}, ${f.featured ? 1 : 0}, ${q(`${f.folder}/${f.filename}`)}, ${js(lf)});`);
}

// ---------------------------------------------------------------- replays
const replayDir = join(DATA, 'replays');
let replayCount = 0;
if (existsSync(replayDir)) {
  for (const name of readdirSync(replayDir).filter((n) => n.endsWith('.json'))) {
    const raw = readFileSync(join(replayDir, name), 'utf8');
    const rec = JSON.parse(raw) as { fileId: string; recordedAt: string };
    const size = 60_000;
    for (let i = 0, part = 0; i < raw.length; i += size, part++) push(`INSERT INTO replays (file_id, part, recorded_at, data) VALUES (${q(rec.fileId)}, ${part}, ${q(rec.recordedAt)}, ${q(raw.slice(i, i + size))});`);
    replayCount++;
  }
}

// ---------------------------------------------------------------- backfilled history
type History = {
  runs: Record<string, unknown>[]; steps: RunStep[]; transcripts: { runId: string; format: string; turns: unknown; redactions: unknown }[]; insights: Insight[]; themes: NewTheme[];
  deliveries: Delivery[]; notifications: Notification[]; reviews: ReviewRecord[]; aiCalls: LlmCallRow[];
};
const historyPath = join(DATA, 'backfill', 'history.json');
let history: History | null = null;
if (existsSync(historyPath)) {
  history = JSON.parse(readFileSync(historyPath, 'utf8')) as History;
  for (const r of history.runs) {
    push(
      `INSERT INTO runs (id, workspace_id, file_id, filename, account_id, call_id, status, mode, mode_reason, sha256, created_at, finished_at, duration_ms, cost_usd, prompt_version, insight_count, dropped_count, review_count, injection_flagged, actionable, error, format, screen, key_scope) VALUES (` +
        [r.id, 'seed', r.fileId, r.filename, r.accountId, r.callId, r.status, 'live', 'seed', r.sha256, r.createdAt, r.finishedAt, r.durationMs, r.costUsd, r.promptVersion, r.insightCount, r.droppedCount, r.reviewCount, r.injectionFlagged ? 1 : 0, r.actionable === null || r.actionable === undefined ? null : r.actionable ? 1 : 0, r.error ?? null, r.format].map(q).join(', ') +
        `, ${r.screen ? js(r.screen) : 'NULL'}, 'build');`,
    );
  }
  for (const s of history.steps) {
    push(`INSERT INTO run_steps (run_id, key, idx, status, started_at, finished_at, duration_ms, model, tokens_in, tokens_out, cost_usd, summary, detail, offset_ms) VALUES (${[s.runId, s.key, STEP_KEYS.indexOf(s.key), s.status, s.startedAt, s.finishedAt, s.durationMs, s.model, s.tokensIn, s.tokensOut, s.costUsd, s.summary].map(q).join(', ')}, ${s.detail ? js(s.detail) : 'NULL'}, NULL);`);
  }
  for (const t of history.transcripts) push(`INSERT INTO transcripts (run_id, format, turns, redactions) VALUES (${q(t.runId)}, ${q(t.format)}, ${js(t.turns)}, ${js(t.redactions)});`);
  for (const i of history.insights) push(`INSERT INTO insights (id, workspace_id, run_id, account_id, type, product_area, status, theme_id, created_at, data) VALUES (${[i.id, 'seed', i.runId, i.accountId, i.type, i.productArea, i.status, i.themeId, i.createdAt].map(q).join(', ')}, ${js({ ...i, workspaceId: 'seed' })});`);
  for (const t of history.themes) push(`INSERT INTO themes (id, workspace_id, name, summary, type, product_area, status, owner_id, created_at, vector) VALUES (${[t.id, 'seed', t.name, t.summary, t.type, t.productArea, t.status, t.ownerId, t.createdAt].map(q).join(', ')}, ${js(t.vector)});`);
  for (const d of history.deliveries) push(`INSERT INTO deliveries (id, workspace_id, insight_id, channel, ticket_state, created_at, data) VALUES (${[d.id, 'seed', d.insightId, d.channel, d.ticketState, d.createdAt].map(q).join(', ')}, ${js({ ...d, workspaceId: 'seed' })});`);
  for (const n of history.notifications) push(`INSERT INTO notifications (id, workspace_id, csm_id, created_at, data) VALUES (${[n.id, 'seed', n.csmId, n.createdAt].map(q).join(', ')}, ${js({ ...n, workspaceId: 'seed' })});`);
  for (const r of history.reviews) push(`INSERT INTO reviews (id, workspace_id, insight_id, idempotency_key, created_at, data, response) VALUES (${[r.id, 'seed', r.insightId, `seed-${r.id}`, r.createdAt].map(q).join(', ')}, ${js(r)}, NULL);`);
  for (const c of history.aiCalls) {
    push(`INSERT OR IGNORE INTO ai_calls (id, run_id, workspace_id, purpose, model, tokens_in, tokens_out, cost_usd, ms, ok, error, attempt, fallback, schema_retry, key_scope, created_at) VALUES (${[c.id, c.runId, 'seed', c.purpose, c.model, c.tokensIn, c.tokensOut, c.costUsd, c.ms, c.ok ? 1 : 0, c.error, c.attempt, c.fallback ? 1 : 0, c.schemaRetry ? 1 : 0, 'build', c.createdAt].map(q).join(', ')});`);
  }
}

// ---------------------------------------------------------------- evals
const evalPath = join(DATA, 'evals', 'latest.json');
if (existsSync(evalPath)) {
  const e = JSON.parse(readFileSync(evalPath, 'utf8')) as { promoted: EvalRun | null; candidate: EvalRun | null; history: EvalRun[] };
  const seen = new Set<string>();
  const add = (run: EvalRun | null, role: string) => {
    if (!run || seen.has(`${role}:${run.id}`)) return;
    seen.add(`${role}:${run.id}`);
    push(`INSERT OR REPLACE INTO eval_runs (id, prompt_version, role, created_at, data) VALUES (${q(role === 'history' ? `${run.id}_h` : run.id)}, ${q(run.promptVersion)}, ${q(role)}, ${q(run.createdAt)}, ${js(run)});`);
  };
  add(e.promoted, 'promoted');
  add(e.candidate, 'candidate');
  for (const h of e.history ?? []) if (h.id !== e.promoted?.id) add(h, 'history');
}

// ---------------------------------------------------------------- write + apply
const outDir = join(ROOT, '.wrangler', 'seed');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const CHUNK_BYTES = 900_000;
const chunks: string[] = [];
let cur = '';
for (const s of stmts) {
  if (cur.length + s.length + 1 > CHUNK_BYTES && cur) {
    chunks.push(cur);
    cur = '';
  }
  cur += `${s}\n`;
}
if (cur) chunks.push(cur);
chunks.forEach((c, i) => writeFileSync(join(outDir, `seed-${String(i).padStart(3, '0')}.sql`), c));
console.log(`[seed] ${stmts.length} statements in ${chunks.length} file(s) · ${replayCount} replays · ${history ? `${history.runs.length} history runs, ${history.insights.length} insights, ${history.themes.length} themes` : 'no backfill history'} · evals ${existsSync(evalPath) ? 'yes' : 'no'}`);
if (dryRun) process.exit(0);

const env = loadEnv();
const win = process.platform === 'win32';
for (let i = 0; i < chunks.length; i++) {
  const file = join(outDir, `seed-${String(i).padStart(3, '0')}.sql`);
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, `--${target}`, '--file', file, '-y', ...(persistTo ? ['--persist-to', persistTo] : [])], { stdio: ['ignore', 'pipe', 'pipe'], shell: win, env: process.env, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout?.slice(-2000), r.stderr?.slice(-2000));
    console.error(`[seed] failed on ${file}`);
    process.exit(1);
  }
  console.log(`[seed] applied ${i + 1}/${chunks.length}`);
}

// ---------------------------------------------------------------- Vectorize (remote only)
if (target === 'remote' && history?.themes.length) {
  const nd = history.themes.map((t) => JSON.stringify({ id: t.id, values: t.vector, metadata: { workspaceId: 'seed', type: t.type, productArea: t.productArea, name: t.name } })).join('\n');
  const file = join(outDir, 'themes.ndjson');
  writeFileSync(file, nd);
  const r = spawnSync('npx', ['wrangler', 'vectorize', 'upsert', DB_NAME, '--file', file], { stdio: 'inherit', shell: win, env: process.env });
  if (r.status !== 0) console.error('[seed] Vectorize upsert failed; the Worker falls back to the D1 cosine scan');
  else console.log(`[seed] upserted ${history.themes.length} theme vectors to Vectorize`);
}
void env;
console.log('[seed] done');
