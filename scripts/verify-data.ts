/**
 * Run every featured file through the full pipeline core with real models and check it
 * against its golden label: no step failures, golden insights found, actionable / injection
 * expectations met, and no PHI token in any text sent to a model. Writes
 * docs/reports/verify-data.md.
 *
 *   node --env-file=.env scripts/verify-data.ts [--only file_a,file_b] [--concurrency 6]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROMPT_VERSION } from '../src/shared/prompts/extract.ts';
import { loadEnv } from './env.ts';
import { pool, runFile, themeIndex } from './lib/core.ts';
import { dataReady, loadGolden, loadLibrary, loadWorld, ROOT } from './lib/data.ts';
import { cloudflareEmbedder } from './lib/embed.ts';
import { buildLlm, buildSpend, MODEL_PRIMARY, MODEL_SECONDARY } from './lib/llm.ts';
import { matchFile, phiLeaks, type FileEval } from './lib/match.ts';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = arg('--only')?.split(',');
const env = loadEnv();
const world = loadWorld();
const golden = loadGolden();
const files = loadLibrary().filter((f) => f.featured && (!only || only.includes(f.id)));
const llm = buildLlm({ tag: 'verify-data' });
const judge = buildLlm({ tag: 'verify-data-judge', primary: MODEL_SECONDARY, secondary: MODEL_PRIMARY });
const embed = cloudflareEmbedder(env, { allowFallback: true });
const spend0 = buildSpend();

type Row = FileEval & { problems: string[]; warnings: string[] };
const rows: Row[] = await pool(files, Number(arg('--concurrency') ?? 6), async (file) => {
  const g = golden.get(file.id);
  const run = await runFile({ file, world, llm, embed, index: themeIndex(), workspaceId: 'verify', promptVersion: PROMPT_VERSION });
  const problems: string[] = [];
  const warnings: string[] = [];
  const failedSteps = run.result.steps.filter((s) => s.status === 'failed');
  if (run.result.status === 'failed' || failedSteps.length) problems.push(`run failed: ${run.result.error ?? failedSteps.map((s) => s.key).join(', ')}`);
  if (!g) {
    warnings.push('no golden label');
    return { run, golden: { fileId: file.id, expectActionable: true, expectInjectionFlag: false, insights: [], phiTokens: [] }, match: { fileId: file.id, goldenCount: 0, predicted: [], pairs: [], goldenSpans: [], judgeCalls: 0 }, phiLeaked: [], problems, warnings };
  }
  const match = await matchFile(run, g, judge);
  const leaked = phiLeaks(run, g);
  if (leaked.length) problems.push(`PHI reached the model: ${leaked.length} token(s)`);
  if (g.expectInjectionFlag && !run.result.injectionFlagged) problems.push('injection not flagged');
  if (!g.expectInjectionFlag && run.result.injectionFlagged) warnings.push('injection flagged on a clean file');
  const predicted = match.predicted.length;
  if (!g.expectActionable && predicted > 0) problems.push(`negative control produced ${predicted} insight(s)`);
  if (g.expectActionable && run.result.actionable === false) warnings.push('screen said not actionable');
  const unlocated = match.goldenSpans.filter((s) => s === null).length;
  if (unlocated) warnings.push(`${unlocated} golden quote(s) not locatable in the redacted transcript`);
  const missed = match.goldenCount - match.pairs.length;
  if (missed) warnings.push(`missed ${missed}/${match.goldenCount} golden insight(s): ${g.insights.filter((_, i) => !match.pairs.some((p) => p.golden === i)).map((x) => x.type).join(', ')}`);
  const extra = predicted - match.pairs.length;
  if (extra > 0) warnings.push(`${extra} extra insight(s) not in golden`);
  console.log(`[verify] ${file.id.padEnd(34)} ${problems.length ? 'FAIL' : 'ok  '} recall ${match.pairs.length}/${match.goldenCount} pred ${predicted} ${problems.concat(warnings).join(' · ')}`);
  return { run, golden: g, match, phiLeaked: leaked, problems, warnings };
});

const totalGolden = rows.reduce((s, r) => s + r.match.goldenCount, 0);
const totalHit = rows.reduce((s, r) => s + r.match.pairs.length, 0);
const totalPred = rows.reduce((s, r) => s + r.match.predicted.length, 0);
const failing = rows.filter((r) => r.problems.length);
const lines = [
  '# verify-data report',
  '',
  `Generated ${new Date().toISOString()} · ${rows.length} featured files · data READY=${dataReady()} · world=${world.source} · prompt ${PROMPT_VERSION} · ${MODEL_PRIMARY} (judge ${MODEL_SECONDARY})`,
  '',
  `- Hard failures: **${failing.length}** (step failures, PHI leakage, missed injection, negative-control false positives)`,
  `- Golden insights found: **${totalHit} / ${totalGolden}** (${totalGolden ? ((totalHit / totalGolden) * 100).toFixed(1) : 'n/a'}%) · predicted ${totalPred} · precision ${totalPred ? ((totalHit / totalPred) * 100).toFixed(1) : 'n/a'}%`,
  `- Spend: $${(buildSpend() - spend0).toFixed(4)}`,
  '',
  '| File | Level / edge | Status | Steps | Golden found | Predicted | Dropped | Notes |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| \`${r.run.file.id}\` | ${r.run.file.messLevel ?? r.run.file.edgeKind ?? '–'} | ${r.problems.length ? '**FAIL**' : 'ok'} | ${r.run.result.steps.filter((s) => s.status === 'failed').length ? 'failed' : 'all passed'} | ${r.match.pairs.length}/${r.match.goldenCount} | ${r.match.predicted.length} | ${r.run.result.insights.filter((i) => i.gate === 'dropped').length} | ${[...r.problems, ...r.warnings].join('; ').replace(/\|/g, '/') || '—'} |`),
  '',
];
mkdirSync(join(ROOT, 'docs', 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'reports', 'verify-data.md'), lines.join('\n'));
console.log(`[verify] ${failing.length} hard failure(s) · golden ${totalHit}/${totalGolden} · report docs/reports/verify-data.md · build total $${buildSpend().toFixed(4)}`);
if (failing.length) process.exitCode = 1;
