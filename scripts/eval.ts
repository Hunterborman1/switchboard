/**
 * Evals: run prompt v4 (promoted) and the v5 candidate over every featured golden file with the
 * primary model, match predictions to golden labels (span overlap; Haiku judge only when
 * ambiguous), compute the metrics and apply the promotion gate from src/shared/scoring.ts.
 * Writes data/evals/latest.json (+ per-file details) for the seed and GET /evals.
 *
 *   node --env-file=.env scripts/eval.ts [--versions v4,v5] [--only file_a] [--concurrency 6]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRun } from '../src/shared/contracts.ts';
import type { LlmCallRow } from '../src/pipeline/types.ts';
import { loadEnv } from './env.ts';
import { pool, runFile, themeIndex } from './lib/core.ts';
import { DATA, dataReady, loadGolden, loadLibrary, loadWorld } from './lib/data.ts';
import { cloudflareEmbedder } from './lib/embed.ts';
import { buildLlm, buildSpend, MODEL_PRIMARY, MODEL_SECONDARY } from './lib/llm.ts';
import { computeEval, matchFile, phiLeaks, type FileEval } from './lib/match.ts';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const versions = (arg('--versions') ?? 'v4,v5').split(',');
const only = arg('--only')?.split(',');
const env = loadEnv();
const world = loadWorld();
const golden = loadGolden();
const files = loadLibrary().filter((f) => f.featured && golden.has(f.id) && (!only || only.includes(f.id)));
const embed = cloudflareEmbedder(env, { allowFallback: true });
console.log(`[eval] ${files.length} golden files · data READY=${dataReady()} · versions ${versions.join(', ')}`);

const outDir = join(DATA, 'evals');
mkdirSync(outDir, { recursive: true });
const latestPath = join(outDir, 'latest.json');
const prior = existsSync(latestPath) ? (JSON.parse(readFileSync(latestPath, 'utf8')) as { promoted: EvalRun | null; candidate: EvalRun | null; history: EvalRun[] }) : null;

const results = new Map<string, EvalRun>();
const spend0 = buildSpend();
for (const version of versions) {
  const calls: LlmCallRow[] = [];
  const llm = buildLlm({ tag: `eval-${version}`, onCall: (r) => void calls.push(r) });
  const judgeCalls: LlmCallRow[] = [];
  const judge = buildLlm({ tag: `eval-judge-${version}`, primary: MODEL_SECONDARY, secondary: MODEL_PRIMARY, onCall: (r) => void judgeCalls.push(r) });
  const evals: FileEval[] = await pool(files, Number(arg('--concurrency') ?? 6), async (file) => {
    const run = await runFile({ file, world, llm, embed, index: themeIndex(), workspaceId: 'eval', promptVersion: version });
    const g = golden.get(file.id)!;
    const match = await matchFile(run, g, judge);
    return { run, golden: g, match, phiLeaked: phiLeaks(run, g) };
  });
  const promoted = version === 'v4' ? null : results.get('v4') ?? prior?.promoted ?? null;
  const ev = computeEval({
    id: `eval_${version}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    promptVersion: version,
    model: MODEL_PRIMARY,
    judgeModel: judgeCalls.length ? MODEL_SECONDARY : null,
    files: evals,
    costUsd: calls.reduce((s, c) => s + c.costUsd, 0) + judgeCalls.reduce((s, c) => s + c.costUsd, 0),
    promoted,
  });
  results.set(version, ev);
  const detail = evals.map((e) => ({
    fileId: e.run.file.id, messLevel: e.run.file.messLevel, edgeKind: e.run.file.edgeKind, status: e.run.result.status, durationMs: e.run.result.durationMs,
    golden: e.golden.insights.map((g, i) => ({ type: g.type, summary: g.summary, matched: e.match.pairs.find((p) => p.golden === i)?.via ?? null })),
    predicted: e.match.predicted.map((p) => ({ id: p.id, type: p.type, summary: p.summary, gate: p.gate, conf: p.confidenceFinal, matched: e.match.pairs.some((x) => x.predicted === p.id) })),
    dropped: e.run.result.insights.filter((i) => i.gate === 'dropped').map((i) => ({ type: i.type, quote: i.evidence[0]?.quote })),
    injectionFlagged: e.run.result.injectionFlagged, phiLeaked: e.phiLeaked.length, judgeCalls: e.match.judgeCalls,
  }));
  writeFileSync(join(outDir, `details-${version}.json`), JSON.stringify(detail, null, 1));
  console.log(`[eval] ${version}: ${ev.promoted ? 'PASSES gate' : 'BLOCKED'} · ${ev.metrics.filter((m) => ['precision', 'recall', 'recall.level5', 'grounding_rate', 'negative_fp_rate', 'injection_flagged', 'phi_leakage'].includes(m.key)).map((m) => `${m.key}=${m.value === null ? 'n/a' : m.value.toFixed(3)}`).join(' ')} · p50 ${ev.p50Ms}ms p95 ${ev.p95Ms}ms · $${ev.costUsd.toFixed(4)}`);
  for (const r of ev.blockedReasons) console.log(`        blocked: ${r}`);
}

const v4 = results.get('v4') ?? prior?.promoted ?? null;
const v5 = results.get('v5') ?? prior?.candidate ?? null;
// v4 is the prompt in production; it stays promoted even if a check fails (the reasons are shown).
const promotedRun: EvalRun | null = v4 ? { ...v4, promoted: true } : null;
const history = [...(prior?.history ?? []).filter((h) => h.id !== promotedRun?.id), ...(promotedRun ? [promotedRun] : [])].slice(-10);
writeFileSync(latestPath, JSON.stringify({ promoted: promotedRun, promotedGatePassed: v4?.promoted ?? null, candidate: v5, history }, null, 1));
console.log(`[eval] wrote ${latestPath} · spend $${(buildSpend() - spend0).toFixed(4)} · build total $${buildSpend().toFixed(4)}`);
