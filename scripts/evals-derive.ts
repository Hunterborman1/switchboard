/**
 * Derives the per-mess-level precision metrics for an existing data/evals/latest.json from the
 * recorded per-file details (data/evals/details-<version>.json), without re-running any model.
 * scripts/lib/match.ts computes the same metrics for new eval runs; this backfills the run
 * already on disk. It also repairs labels that were written with a double-encoded "·".
 *
 *   node scripts/evals-derive.ts          # rewrite latest.json in place
 *   node scripts/evals-derive.ts --check  # fail if latest.json is out of date
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRun } from '../src/shared/contracts.ts';

type Detail = { fileId: string; messLevel: number | null; golden: { matched: string | null }[]; predicted: { matched: boolean }[] };
type Latest = { promoted: EvalRun | null; candidate: EvalRun | null; history: EvalRun[]; [k: string]: unknown };

const DIR = join(import.meta.dirname, '..', 'data', 'evals');
const latestPath = join(DIR, 'latest.json');
const before = readFileSync(latestPath, 'utf8');
const latest = JSON.parse(before) as Latest;

const fixLabel = (s: string) => s.replace(/Â·/g, '·');
const round = (v: number) => Math.round(v * 10000) / 10000;

function derive(run: EvalRun | null): void {
  if (!run) return;
  for (const m of run.metrics) m.label = fixLabel(m.label);
  const path = join(DIR, `details-${run.promptVersion}.json`);
  if (!existsSync(path)) return;
  const details = JSON.parse(readFileSync(path, 'utf8')) as Detail[];
  if (details.length !== run.files) throw new Error(`${path}: ${details.length} files, run says ${run.files}`);
  for (const level of [1, 2, 3, 4, 5]) {
    const fs = details.filter((d) => d.messLevel === level);
    const predicted = fs.reduce((s, d) => s + d.predicted.length, 0);
    const hit = fs.reduce((s, d) => s + d.predicted.filter((p) => p.matched).length, 0);
    // Cross-check against the recall row recorded by the original run (same matches, other denominator).
    const recall = run.metrics.find((m) => m.key === `recall.level${level}`);
    if (recall && recall.numerator !== hit) throw new Error(`${run.promptVersion} L${level}: ${hit} matched predictions, recall row says ${recall.numerator}`);
    const metric = { key: `precision.level${level}`, label: `Precision · mess level ${level}`, value: predicted ? round(hit / predicted) : null, numerator: hit, denominator: predicted, threshold: null, passed: null };
    const i = run.metrics.findIndex((m) => m.key === metric.key);
    if (i >= 0) run.metrics[i] = metric;
    else run.metrics.splice(run.metrics.findIndex((m) => m.key === `recall.level${level}`) + 1, 0, metric);
  }
  // The pooled numbers must still add up.
  const total = details.reduce((s, d) => s + d.predicted.length, 0);
  const pooled = run.metrics.find((m) => m.key === 'precision');
  if (pooled && pooled.denominator !== total) throw new Error(`${run.promptVersion}: ${total} predictions in details, pooled precision says ${pooled.denominator}`);
}

derive(latest.promoted);
derive(latest.candidate);
for (const h of latest.history ?? []) derive(h);

const after = `${JSON.stringify(latest, null, 1)}\n`;
if (process.argv.includes('--check')) {
  if (JSON.stringify(JSON.parse(before)) !== JSON.stringify(latest)) {
    console.error('[evals-derive] latest.json is missing derived metrics; run node scripts/evals-derive.ts');
    process.exit(1);
  }
  console.log('[evals-derive] up to date');
} else {
  writeFileSync(latestPath, after);
  console.log(`[evals-derive] wrote ${latestPath}`);
}
