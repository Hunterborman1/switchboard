/**
 * Record a real run of every featured file (build key, real models) as data/replays/<fileId>.json.
 * Themes are matched against the backfilled history (data/backfill/history.json) so recorded
 * insights join the same themes a live run would.
 *
 *   node --env-file=.env scripts/record-replays.ts [--only file_a,file_b] [--concurrency 4]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toRecording } from '../src/pipeline/replay.ts';
import type { NewTheme } from '../src/pipeline/types.ts';
import { PROMPT_VERSION } from '../src/shared/prompts/extract.ts';
import { loadEnv } from './env.ts';
import { pool, runFile, summarizeSteps, themeIndex } from './lib/core.ts';
import { DATA, dataReady, loadLibrary, loadWorld } from './lib/data.ts';
import { cloudflareEmbedder } from './lib/embed.ts';
import { buildLlm, buildSpend } from './lib/llm.ts';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = arg('--only')?.split(',');
const concurrency = Number(arg('--concurrency') ?? 4);

const env = loadEnv();
const world = loadWorld();
const library = loadLibrary().filter((f) => f.featured && (!only || only.includes(f.id)));
const historyPath = join(DATA, 'backfill', 'history.json');
const seedThemes: NewTheme[] = existsSync(historyPath) ? (JSON.parse(readFileSync(historyPath, 'utf8')).themes as NewTheme[]) : [];
console.log(`[replays] ${library.length} featured files · world=${world.source} · data READY=${dataReady()} · ${seedThemes.length} seed themes`);

const llm = buildLlm({ tag: 'record-replays' });
const embed = cloudflareEmbedder(env, { allowFallback: false });
const outDir = join(DATA, 'replays');
mkdirSync(outDir, { recursive: true });

const spend0 = buildSpend();
let failures = 0;
await pool(library, concurrency, async (file) => {
  // Each recording sees the seed history only (never another recording's new themes).
  const index = themeIndex(seedThemes);
  const r = await runFile({ file, world, llm, embed, index, addThemesToIndex: false, workspaceId: 'rec', promptVersion: PROMPT_VERSION });
  const recordedAt = r.result.steps[0]?.startedAt ?? new Date().toISOString();
  const rec = toRecording(file.id, r.result, recordedAt, PROMPT_VERSION);
  if (r.result.status === 'failed') failures++;
  writeFileSync(join(outDir, `${file.id}.json`), JSON.stringify(rec));
  const ins = r.result.insights;
  console.log(`[replays] ${file.id.padEnd(34)} ${r.result.status.padEnd(15)} ${String(rec.totalMs).padStart(6)}ms  ins=${ins.filter((i) => i.gate !== 'dropped').length} drop=${ins.filter((i) => i.gate === 'dropped').length} review=${ins.filter((i) => i.gate === 'review').length}  ${summarizeSteps(r.result.steps)}`);
});
console.log(`[replays] done · ${failures} failed · spend this run $${(buildSpend() - spend0).toFixed(4)} · build total $${buildSpend().toFixed(4)}`);
if (failures) process.exitCode = 1;
