import type { EvalRun, InsightType } from '../../../shared/contracts';
import { INSIGHT_TYPES } from '../../../shared/contracts';
import { pctText, ptsText, rateOf } from '../../../shared/format';

export type Metric = EvalRun['metrics'][number];

export const LOWER_IS_BETTER = new Set(['negative_fp_rate', 'phi_leakage', 'run_failures']);

export const LEVELS: { n: 1 | 2 | 3 | 4 | 5; label: string; hint: string }[] = [
  { n: 1, label: 'Clean notes', hint: 'Level 1: structured CSM notes' },
  { n: 2, label: 'Tidy', hint: 'Level 2: speaker-labelled transcript' },
  { n: 3, label: 'Everyday', hint: 'Level 3: filler, tangents, insights spread over several turns' },
  { n: 4, label: 'Noisy', hint: 'Level 4: speech-to-text errors, speaker swaps, crosstalk' },
  { n: 5, label: 'Chaotic', hint: 'Level 5: Slack shorthand, forwarded email, partial transcript' },
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
    if (lvl) return `${K} on level ${lvl[1]} files (${LEVELS.find((l) => String(l.n) === lvl[1])?.label.toLowerCase() ?? 'mixed'})`;
    if (TYPE_WORDS[sub]) return `${TYPE_WORDS[sub].charAt(0).toUpperCase()}${TYPE_WORDS[sub].slice(1)} ${kind}`;
  }
  if (m.key === 'precision') return 'Precision (all types)';
  if (m.key === 'recall') return 'Recall (all types)';
  if (m.key === 'routing_accuracy') return 'Sent to the expected owner';
  if (m.key === 'negative_fp_rate') return 'Invented on empty calls';
  if (m.key === 'grounding_rate') return 'Quotes grounded';
  return m.label.replace(/Â(?=·)/g, '').replace(/\s*·\s*/g, ', ');
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
  if (m.threshold == null) return 'none';
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

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Pooled precision or recall as a metric row, for runs that don't record the pooled key. */
export function pooledMetric(run: EvalRun, kind: 'precision' | 'recall'): Metric | null {
  const p = pooled(run, kind);
  if (!p.denominator) return null;
  return { key: kind, label: kind === 'precision' ? 'Precision (all types)' : 'Recall (all types)', value: p.value, numerator: p.numerator, denominator: p.denominator, threshold: null, passed: null };
}

/** "extract@v5" → "v5". */
export const ver = (v: string) => v.split('@').pop() ?? v;

/** Plain names for the metrics the gate headline can name. */
const HEADLINE_NAME: Record<string, string> = {
  precision: 'precision',
  recall: 'recall',
  'recall.level5': 'recall on the messiest files',
  grounding_rate: 'quote grounding',
  negative_fp_rate: 'invented insights on empty calls',
  injection_flagged: 'manipulation attempts caught',
  injection_resistance: 'manipulation attempts caught',
  phi_leakage: 'health information leaked',
  run_failures: 'failed test runs',
};

/** One line for the gate result: "Blocked: precision fell from 88.7% to 59.7%". */
export function gateHeadline(candidate: EvalRun, current: EvalRun): string {
  if (candidate.promoted) return `Promoted: ${ver(candidate.promptVersion)} is now live`;
  const failed = candidate.metrics.filter((x) => passed(x) === false);
  const keys = [...new Set(failed.map((x) => x.key.replace(/^regression\./, '')))];
  const key = keys.find((k) => metric(candidate, k) && metric(current, k)) ?? keys[0];
  if (!key) return `Blocked: ${candidate.blockedReasons.length || 'some'} go-live rule${candidate.blockedReasons.length === 1 ? '' : 's'} failed`;
  const now = metric(candidate, key);
  const before = metric(current, key);
  const name = HEADLINE_NAME[key] ?? metricLabel(now ?? before!).toLowerCase();
  const a = rate(before);
  const b = rate(now);
  if (a != null && b != null && b !== a) return `Blocked: ${name} ${b < a ? 'fell' : 'rose'} from ${pctOf(a)} to ${pctOf(b)}`;
  if (b != null && now?.threshold != null) return `Blocked: ${name} is ${pctOf(b)}, against a target of ${thresholdLabel(now)}`;
  return `Blocked: ${name} missed its go-live rule`;
}

export type GateCheck = { id: string; label: string; detail: string; ok: boolean; info?: boolean };

/** Every percent on the Evals page goes through shared/format (exact fraction when recorded). */
const pctOf = (v: number | null | undefined) => pctText(v, 1);
const frac = (m: Metric | null) => (m?.numerator != null && m.denominator != null ? ` (${m.numerator} of ${m.denominator})` : '');
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
  const P = m('precision') ?? pooledMetric(candidate, 'precision');
  const R = m('recall') ?? pooledMetric(candidate, 'recall');
  const L5 = m('recall.level5');
  const g = m('grounding_rate');
  const fp = m('negative_fp_rate');
  const inj = m('injection_flagged') ?? m('injection_resistance');
  const phi = m('phi_leakage');
  const regs = candidate.metrics.filter((x) => x.key.startsWith('regression.'));
  const regFails = regs.filter((x) => x.passed === false);
  const regKey = (k: string) => k.replace('regression.', '').replace('recall.level5', 'recall on the messiest files');
  const costDelta = current.costUsd ? (candidate.costUsd - current.costUsd) / current.costUsd : 0;
  const p95Delta = current.p95Ms ? (candidate.p95Ms - current.p95Ms) / current.p95Ms : 0;
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`;
  const checks: GateCheck[] = [
    { id: 'schema', label: 'Every test file runs to completion', detail: `${failures?.numerator ?? 0} of ${candidate.files} runs failed`, ok: ok(failures) },
    { id: 'precision', label: `Precision at least ${P?.threshold != null ? (P.threshold * 100).toFixed(0) : 85}% (all types)`, detail: `${pctOf(rate(P))}${frac(P)}`, ok: ok(P) },
    { id: 'recall', label: `Recall at least ${R?.threshold != null ? (R.threshold * 100).toFixed(0) : 80}% (all types)`, detail: `${pctOf(rate(R))}${frac(R)}`, ok: ok(R) },
    { id: 'l5', label: `Recall on the messiest files at least ${L5?.threshold != null ? (L5.threshold * 100).toFixed(0) : 70}%`, detail: `${pctOf(rate(L5))}${frac(L5)}`, ok: ok(L5) },
    { id: 'grounding', label: 'Quotes still found in the conversation', detail: `${pctOf(rate(g))}${frac(g)}, target ${g ? thresholdLabel(g) : '—'}`, ok: ok(g) },
    {
      id: 'negative',
      label: 'No invented work on files with nothing actionable',
      detail: fp?.denominator != null ? `Invented on ${fp.numerator ?? 0} of ${fp.denominator} files` : 'Not measured',
      ok: ok(fp),
    },
    {
      id: 'safety',
      label: 'Manipulation attempts caught, no health information reaches the AI',
      detail: `Caught ${pctOf(rate(inj))}${frac(inj)}, leaked on ${pctOf(rate(phi))}${frac(phi)}`,
      ok: ok(inj) && ok(phi),
    },
  ];
  if (regs.length) {
    checks.push({
      id: 'regression',
      label: `Nothing more than 2 points worse than ${ver(current.promptVersion)}`,
      detail: capitalize((regFails.length ? regFails : regs).map((x) => `${regKey(x.key)} ${pts(x.value ?? 0)}`).join(', ')),
      ok: regFails.length === 0,
    });
  }
  checks.push({
    id: 'cost',
    label: 'Cost and speed, reported but not a rule',
    detail: `Test cost ${signed(costDelta)}, slowest 5% of files ${signed(p95Delta)} compared with ${ver(current.promptVersion)}`,
    ok: true,
    info: true,
  });
  return checks;
}

/** The one-sentence verdict under the gate, written from the numbers (never hard-coded). */
export function gateVerdict(candidate: EvalRun, current: EvalRun): string {
  const cand = ver(candidate.promptVersion);
  const cur = ver(current.promptVersion);
  if (candidate.promoted) return `${cand} is now the live prompt. New runs record it on every insight.`;
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
    : `it misses ${candidate.blockedReasons.length} go-live rule${candidate.blockedReasons.length === 1 ? '' : 's'}`;
  const slower = candidate.p95Ms > current.p95Ms;
  const costlier = candidate.costUsd > current.costUsd;
  const also = slower && costlier ? ' It is also slower and costs more to run.' : slower ? ' It is also slower.' : costlier ? ' It also costs more to run.' : '';
  return `${cur} stays live. ${parts.length ? `${parts[0]}, but ${tail}` : `${cand} is blocked: ${tail}`}.${also}`;
}
