import type { EvalRun, InsightType } from '../../../shared/contracts';
import { INSIGHT_TYPES } from '../../../shared/contracts';
import { pctText, ptsText, rateOf } from '../../../shared/format';

export type Metric = EvalRun['metrics'][number];

export const LOWER_IS_BETTER = new Set(['negative_fp_rate', 'phi_leakage']);

export const LEVELS: { n: 1 | 2 | 3 | 4 | 5; label: string; hint: string }[] = [
  { n: 1, label: 'Clean', hint: 'Structured CSM notes' },
  { n: 2, label: 'Tidy', hint: 'Speaker-labelled transcript' },
  { n: 3, label: 'Real', hint: 'Filler, tangents, multi-turn insights' },
  { n: 4, label: 'Messy ASR', hint: 'Homophones, speaker swaps, crosstalk' },
  { n: 5, label: 'Chaos', hint: 'Slack shorthand, forwarded email, partial transcript' },
];

export function metric(run: EvalRun | null | undefined, key: string): Metric | null {
  return run?.metrics.find((m) => m.key === key) ?? null;
}

const TYPE_WORDS: Record<string, string> = {
  feature_request: 'feature request',
  bug: 'bug',
  pricing_objection: 'pricing objection',
  competitor_mention: 'competitor mention',
  churn_risk: 'churn risk',
  praise: 'praise',
};

/** Display label for a metric, built from its key (labels stored with older runs vary). */
export function metricLabel(m: Metric): string {
  const [kind, sub] = m.key.split('.') as [string, string | undefined];
  if ((kind === 'precision' || kind === 'recall') && sub) {
    const K = kind === 'precision' ? 'Precision' : 'Recall';
    const lvl = /^level(\d)$/.exec(sub);
    if (lvl) return `${K} · mess level ${lvl[1]}`;
    if (TYPE_WORDS[sub]) return `${K} · ${TYPE_WORDS[sub]}`;
  }
  if (m.key === 'precision') return 'Precision (all types)';
  if (m.key === 'recall') return 'Recall (all types)';
  return m.label.replace(/Â(?=·)/g, '');
}

export function unitFor(key: string): string {
  if (key.startsWith('precision')) return 'of extracted';
  if (key.startsWith('recall')) return 'of planted';
  if (key === 'grounding_rate') return 'kept quotes';
  if (key === 'hallucination_caught' || key === 'hallucinations_caught') return 'dropped';
  if (key === 'negative_fp_rate') return 'nothing-actionable files';
  if (key === 'injection_resistance' || key === 'injection_flagged') return 'injection files';
  if (key === 'phi_leakage') return 'PHI files';
  if (key === 'routing_accuracy') return 'routed';
  return '';
}

export function thresholdLabel(m: Metric): string {
  if (m.threshold == null) return 'no threshold';
  const pct = `${(m.threshold * 100).toFixed(0)}%`;
  return LOWER_IS_BETTER.has(m.key) ? `≤ ${pct}` : `≥ ${pct}`;
}

export function passed(m: Metric | null): boolean | null {
  if (!m) return null;
  if (m.passed != null) return m.passed;
  if (m.value == null || m.threshold == null) return null;
  return LOWER_IS_BETTER.has(m.key) ? m.value <= m.threshold : m.value >= m.threshold;
}

/** Pooled precision/recall across the six types (sum of numerators over sum of denominators). */
export function pooled(run: EvalRun, kind: 'precision' | 'recall'): { value: number | null; numerator: number; denominator: number } {
  let num = 0;
  let den = 0;
  for (const t of INSIGHT_TYPES) {
    const m = metric(run, `${kind}.${t}`);
    num += m?.numerator ?? 0;
    den += m?.denominator ?? 0;
  }
  return { value: den ? num / den : null, numerator: num, denominator: den };
}

export function f1(run: EvalRun): number | null {
  const p = pooled(run, 'precision').value;
  const r = pooled(run, 'recall').value;
  if (p == null || r == null || p + r === 0) return null;
  return (2 * p * r) / (p + r);
}

export type GateCheck = { id: string; label: string; detail: string; ok: boolean; info?: boolean };

/** Every percent on the Evals page goes through shared/format (exact fraction when recorded). */
const pctOf = (v: number | null | undefined) => pctText(v, 1);
const frac = (m: Metric | null) => (m?.numerator != null && m.denominator != null ? ` (${m.numerator}/${m.denominator})` : '');
const pts = (v: number) => ptsText(v, 1);
/** A metric's exact rate (numerator/denominator when recorded). */
const rate = (m: Metric | null | undefined) => rateOf(m);

/**
 * The promotion gate, read from the candidate run's own recorded rules (the same rules
 * scripts/lib/match.ts applied: thresholds plus non-regression vs production). Cost and p95
 * are shown for context but are not gate rules, so they never count as a failure.
 */
export function gateChecks(candidate: EvalRun, current: EvalRun): GateCheck[] {
  const m = (k: string) => metric(candidate, k);
  const ok = (x: Metric | null) => passed(x) !== false;
  const failures = m('run_failures');
  const P = m('precision');
  const R = m('recall');
  const L5 = m('recall.level5');
  const g = m('grounding_rate');
  const fp = m('negative_fp_rate');
  const inj = m('injection_flagged') ?? m('injection_resistance');
  const phi = m('phi_leakage');
  const regs = candidate.metrics.filter((x) => x.key.startsWith('regression.'));
  const regFails = regs.filter((x) => x.passed === false);
  const regKey = (k: string) => k.replace('regression.', '').replace('recall.level5', 'level-5 recall');
  const costDelta = current.costUsd ? (candidate.costUsd - current.costUsd) / current.costUsd : 0;
  const p95Delta = current.p95Ms ? (candidate.p95Ms - current.p95Ms) / current.p95Ms : 0;
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`;
  const checks: GateCheck[] = [
    { id: 'schema', label: 'Every golden file runs to completion', detail: `${failures?.numerator ?? 0} of ${candidate.files} runs failed`, ok: ok(failures) },
    { id: 'precision', label: `Precision ≥ ${P?.threshold != null ? (P.threshold * 100).toFixed(0) : 85}% (all types)`, detail: `${pctOf(rate(P))}${frac(P)}`, ok: ok(P) },
    { id: 'recall', label: `Recall ≥ ${R?.threshold != null ? (R.threshold * 100).toFixed(0) : 80}% (all types)`, detail: `${pctOf(rate(R))}${frac(R)}`, ok: ok(R) },
    { id: 'l5', label: `Recall on level-5 chaos files ≥ ${L5?.threshold != null ? (L5.threshold * 100).toFixed(0) : 70}%`, detail: `${pctOf(rate(L5))}${frac(L5)}`, ok: ok(L5) },
    { id: 'grounding', label: 'Grounding rate holds', detail: `${pctOf(rate(g))}${frac(g)} · threshold ${g ? thresholdLabel(g) : '—'}`, ok: ok(g) },
    { id: 'negative', label: 'No invented work on nothing-actionable files', detail: `false-positive rate ${pctOf(rate(fp))}${frac(fp)}`, ok: ok(fp) },
    { id: 'safety', label: 'Injection flagged · zero PHI reached the model', detail: `injection ${pctOf(rate(inj))} · PHI leakage ${pctOf(rate(phi))}`, ok: ok(inj) && ok(phi) },
  ];
  if (regs.length) {
    checks.push({
      id: 'regression',
      label: `No regression vs ${current.promptVersion} beyond 2 pts`,
      detail: (regFails.length ? regFails : regs).map((x) => `${regKey(x.key)} ${pts(x.value ?? 0)}`).join(' · '),
      ok: regFails.length === 0,
    });
  }
  checks.push({
    id: 'cost',
    label: 'Cost and p95 latency (reported, not gated)',
    detail: `eval cost ${signed(costDelta)} · p95 ${signed(p95Delta)} vs ${current.promptVersion}`,
    ok: true,
    info: true,
  });
  return checks;
}

/** The one-sentence verdict under the gate, written from the numbers (never hard-coded). */
export function gateVerdict(candidate: EvalRun, current: EvalRun): string {
  const cand = candidate.promptVersion;
  const cur = current.promptVersion;
  if (candidate.promoted) return `${cand} is now the production prompt. New runs record it on every insight.`;
  const P = metric(candidate, 'precision');
  const P0 = metric(current, 'precision');
  const R = metric(candidate, 'recall');
  const R0 = metric(current, 'recall');
  const parts: string[] = [];
  const r = rate(R);
  const r0 = rate(R0);
  const p = rate(P);
  const p0 = rate(P0);
  if (r != null && r0 != null && r > r0) parts.push(`${cand} finds slightly more (recall ${pctOf(r)}, ${pts(r - r0)})`);
  const precisionFell = p != null && p0 != null && p < p0;
  const tail = precisionFell
    ? `precision falls to ${pctOf(p)} (${pts(p! - p0!)}): about ${Math.round((1 - p!) * 10)} in 10 of its insights would be noise`
    : `it misses ${candidate.blockedReasons.length} gate rule${candidate.blockedReasons.length === 1 ? '' : 's'}`;
  const slower = candidate.p95Ms > current.p95Ms;
  const costlier = candidate.costUsd > current.costUsd;
  const also = slower && costlier ? ' It is also slower and costs more to run.' : slower ? ' It is also slower.' : costlier ? ' It also costs more to run.' : '';
  return `${cur} stays in production. ${parts.length ? `${parts[0]}, but ${tail}` : `${cand} is blocked: ${tail}`}.${also}`;
}
