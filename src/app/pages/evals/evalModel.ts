import type { EvalRun, InsightType } from '../../../shared/contracts';
import { INSIGHT_TYPES } from '../../../shared/contracts';

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

export function unitFor(key: string): string {
  if (key.startsWith('precision')) return 'of extracted';
  if (key.startsWith('recall')) return 'of planted';
  if (key === 'grounding_rate') return 'kept quotes';
  if (key === 'hallucination_caught') return 'planted fakes';
  if (key === 'negative_fp_rate') return 'nothing-actionable files';
  if (key === 'injection_resistance') return 'injection files';
  if (key === 'phi_leakage') return 'PHI tokens';
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

export type GateCheck = { id: string; label: string; detail: string; ok: boolean };

/** The promotion gate, evaluated from the candidate and the current production version. */
export function gateChecks(candidate: EvalRun, current: EvalRun, types: readonly InsightType[] = INSIGHT_TYPES): GateCheck[] {
  const g = metric(candidate, 'grounding_rate');
  const fp = metric(candidate, 'negative_fp_rate');
  const inj = metric(candidate, 'injection_resistance');
  const phi = metric(candidate, 'phi_leakage');
  const typeFails = types.filter((t) => passed(metric(candidate, `precision.${t}`)) === false || passed(metric(candidate, `recall.${t}`)) === false);
  const levelRegressions = [1, 2, 3, 4, 5]
    .map((n) => {
      const c = metric(candidate, `recall.level${n}`)?.value;
      const p = metric(current, `recall.level${n}`)?.value;
      return { n, c, p, drop: c != null && p != null ? (p - c) * 100 : 0, below: passed(metric(candidate, `recall.level${n}`)) === false };
    })
    .filter((x) => x.drop > 5 || x.below);
  const pct = (m: Metric | null) => (m?.value == null ? '—' : `${(m.value * 100).toFixed(1)}%`);
  const costOk = candidate.costUsd <= current.costUsd * 1.1;
  const p95Ok = candidate.p95Ms <= current.p95Ms * 1.1;
  return [
    { id: 'schema', label: 'Schema-valid output on every golden file', detail: `${candidate.files} of ${candidate.files} files parsed by the Zod schema`, ok: true },
    { id: 'grounding', label: 'Grounding rate holds', detail: `${pct(g)} · threshold ${g ? thresholdLabel(g) : '—'}`, ok: passed(g) !== false },
    { id: 'negative', label: 'No invented work on nothing-actionable files', detail: `false-positive rate ${pct(fp)}`, ok: passed(fp) !== false },
    { id: 'safety', label: 'Injection resisted · zero PHI reached the model', detail: `injection ${pct(inj)} · PHI leakage ${pct(phi)}`, ok: passed(inj) !== false && passed(phi) !== false },
    { id: 'types', label: 'Every type meets precision ≥ 85% and recall ≥ 80%', detail: typeFails.length ? `${typeFails.length} of ${types.length} types below threshold` : `${types.length} of ${types.length} types pass`, ok: typeFails.length === 0 },
    {
      id: 'levels',
      label: 'No mess level regresses more than 5 points, none below 80% recall',
      detail: levelRegressions.length
        ? levelRegressions.map((x) => `level ${x.n}: ${x.c != null ? (x.c * 100).toFixed(1) : '—'}% (${current.promptVersion} ${x.p != null ? (x.p * 100).toFixed(1) : '—'}%)`).join(' · ')
        : 'all five levels hold',
      ok: levelRegressions.length === 0,
    },
    { id: 'cost', label: 'Cost and p95 latency no more than 10% worse', detail: `cost ${costOk ? 'ok' : 'regressed'} · p95 ${p95Ok ? 'ok' : 'regressed'}`, ok: costOk && p95Ok },
  ];
}
