/**
 * Golden ↔ predicted insight matching and eval metrics.
 * A prediction matches a golden insight when the type is the same AND either its grounded
 * evidence overlaps the golden quote's span in the (redacted) transcript, or — only when that is
 * ambiguous — an independent judge model says they describe the same issue.
 */
import type { EvalRun, GoldenLabel, Insight } from '../../src/shared/contracts.ts';
import { groundFragment, normalize } from '../../src/pipeline/ground.ts';
import { PROMOTION_GATE } from '../../src/shared/scoring.ts';
import { JUDGE_JSON_SCHEMA, JUDGE_SYSTEM, JudgeOutput, judgePrompt } from '../../src/shared/prompts/judge.ts';
import type { LlmClient } from '../../src/pipeline/types.ts';
import { percentile } from '../../src/pipeline/util.ts';
import type { FileRun } from './core.ts';

/** Swap original PII in a golden quote for the run's redaction tokens, so it can be grounded. */
export function redactQuote(quote: string, vault: Record<string, string>): string {
  let q = quote;
  const entries = Object.entries(vault).sort((a, b) => b[1].length - a[1].length);
  for (const [token, original] of entries) {
    if (!original) continue;
    q = q.split(original).join(token);
    const first = original.split(/\s+/)[0];
    if (first && first.length >= 3 && /^[A-Z]/.test(first) && (token.startsWith('[PERSON') || token.startsWith('[PATIENT'))) q = q.replace(new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), token);
  }
  return q;
}

export type MatchPair = { golden: number; predicted: string; via: 'span' | 'judge' };
export type FileMatch = {
  fileId: string;
  goldenCount: number;
  predicted: Insight[];
  pairs: MatchPair[];
  goldenSpans: ({ start: number; end: number } | null)[];
  judgeCalls: number;
};

function overlap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  const o = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return o / Math.max(1, Math.min(a.end - a.start, b.end - b.start));
}

export async function matchFile(run: FileRun, golden: GoldenLabel, judge: LlmClient | null): Promise<FileMatch> {
  const t = run.state.transcripts.get(run.runId);
  const doc = t?.doc.text ?? '';
  const docNorm = normalize(doc);
  const vault = t?.doc.vault ?? {};
  const predicted = run.result.insights.filter((i) => i.gate !== 'dropped');
  const goldenSpans = golden.insights.map((g) => {
    const h = groundFragment(redactQuote(g.quote, vault), doc, docNorm, 0.8);
    return h.ok ? { start: h.start, end: h.end } : null;
  });
  const pairs: MatchPair[] = [];
  const used = new Set<string>();
  let judgeCalls = 0;
  // Pass 1: span overlap, same type.
  golden.insights.forEach((g, gi) => {
    const span = goldenSpans[gi];
    if (!span) return;
    let best: { id: string; score: number } | null = null;
    for (const p of predicted) {
      if (used.has(p.id) || p.type !== g.type) continue;
      for (const e of p.evidence) {
        if (e.start === null || e.end === null) continue;
        const s = overlap(span, { start: e.start, end: e.end });
        if (s >= 0.3 && (!best || s > best.score)) best = { id: p.id, score: s };
      }
    }
    if (best) {
      pairs.push({ golden: gi, predicted: best.id, via: 'span' });
      used.add(best.id);
    }
  });
  // Pass 2: ambiguous leftovers (same type, different span) go to the judge.
  if (judge) {
    for (let gi = 0; gi < golden.insights.length; gi++) {
      if (pairs.some((p) => p.golden === gi)) continue;
      const g = golden.insights[gi]!;
      const cands = predicted.filter((p) => !used.has(p.id) && p.type === g.type).slice(0, 5);
      if (!cands.length) continue;
      judgeCalls++;
      try {
        const r = await judge.structured({
          purpose: 'judge', system: JUDGE_SYSTEM, schema: JudgeOutput, jsonSchema: JUDGE_JSON_SCHEMA as unknown as Record<string, unknown>, schemaName: 'judge', maxTokens: 200, runId: run.runId,
          prompt: judgePrompt({ type: g.type, productArea: g.productArea, summary: g.summary, quote: g.quote }, cands.map((c) => ({ type: c.type, productArea: c.productArea, summary: c.summary, quote: c.evidence[0]?.matchedText ?? c.evidence[0]?.quote ?? '' }))),
        });
        const idx = r.data.match_index;
        if (idx !== null && idx >= 0 && idx < cands.length) {
          pairs.push({ golden: gi, predicted: cands[idx]!.id, via: 'judge' });
          used.add(cands[idx]!.id);
        }
      } catch {
        /* judge unavailable: leave unmatched (conservative) */
      }
    }
  }
  return { fileId: golden.fileId, goldenCount: golden.insights.length, predicted, pairs, goldenSpans, judgeCalls };
}

export type FileEval = { run: FileRun; golden: GoldenLabel; match: FileMatch; phiLeaked: string[] };

export function phiLeaks(run: FileRun, golden: GoldenLabel): string[] {
  const sent = run.result.modelInputs.join('\n').toLowerCase();
  return golden.phiTokens.filter((t) => t.trim() && sent.includes(t.toLowerCase()));
}

const rate = (n: number, d: number) => (d ? n / d : null);

export function computeEval(o: { id: string; promptVersion: string; model: string; judgeModel: string | null; files: FileEval[]; costUsd: number; promoted?: EvalRun | null }): EvalRun {
  const metrics: EvalRun['metrics'] = [];
  const add = (key: string, label: string, num: number, den: number, threshold: number | null, cmp: 'gte' | 'lte' = 'gte') => {
    const value = rate(num, den);
    metrics.push({ key, label, value: value === null ? null : Math.round(value * 10000) / 10000, numerator: num, denominator: den, threshold, passed: threshold === null || value === null ? null : cmp === 'gte' ? value >= threshold - 1e-9 : value <= threshold + 1e-9 });
  };
  const allPred = o.files.flatMap((f) => f.match.predicted);
  const matchedPred = o.files.reduce((s, f) => s + f.match.pairs.length, 0);
  const goldenTotal = o.files.reduce((s, f) => s + f.match.goldenCount, 0);
  add('precision', 'Precision (all types)', matchedPred, allPred.length, PROMOTION_GATE.precision);
  add('recall', 'Recall (all types)', matchedPred, goldenTotal, PROMOTION_GATE.recall);
  for (const type of ['feature_request', 'bug', 'pricing_objection', 'competitor_mention', 'churn_risk', 'praise'] as const) {
    const predT = allPred.filter((p) => p.type === type).length;
    const goldT = o.files.reduce((s, f) => s + f.golden.insights.filter((g) => g.type === type).length, 0);
    const hitT = o.files.reduce((s, f) => s + f.match.pairs.filter((p) => f.golden.insights[p.golden]!.type === type).length, 0);
    add(`precision.${type}`, `Precision · ${type.replace(/_/g, ' ')}`, hitT, predT, null);
    add(`recall.${type}`, `Recall · ${type.replace(/_/g, ' ')}`, hitT, goldT, null);
  }
  for (const level of [1, 2, 3, 4, 5] as const) {
    const fs = o.files.filter((f) => f.run.file.messLevel === level);
    const gold = fs.reduce((s, f) => s + f.match.goldenCount, 0);
    const hit = fs.reduce((s, f) => s + f.match.pairs.length, 0);
    add(`recall.level${level}`, `Recall · mess level ${level}`, hit, gold, level === 5 ? PROMOTION_GATE.recallL5 : null);
    add(`precision.level${level}`, `Precision · mess level ${level}`, hit, fs.reduce((s, f) => s + f.match.predicted.length, 0), null);
  }
  const quotes = o.files.flatMap((f) => f.run.result.insights.flatMap((i) => i.evidence));
  const groundedQ = quotes.filter((e) => e.method !== 'failed').length;
  add('grounding_rate', 'Quotes grounded in the transcript', groundedQ, quotes.length, PROMOTION_GATE.grounding);
  const dropped = o.files.reduce((s, f) => s + f.run.result.insights.filter((i) => i.gate === 'dropped').length, 0);
  metrics.push({ key: 'hallucinations_caught', label: 'Hallucinated quotes caught and dropped', value: dropped, numerator: dropped, denominator: null, threshold: null, passed: null });
  const routed = o.files.flatMap((f) => f.match.pairs.map((p) => ({ g: f.golden.insights[p.golden]!, pred: f.match.predicted.find((x) => x.id === p.predicted)! }))).filter((x) => x.g.owner);
  add('routing_accuracy', 'Routed to the expected owner', routed.filter((x) => x.pred.ownerId === x.g.owner).length, routed.length, null);
  const negatives = o.files.filter((f) => f.run.file.edgeKind === 'nothing_actionable' || (!f.golden.expectActionable && f.golden.insights.length === 0));
  add('negative_fp_rate', 'Negative controls with any insight (false positives)', negatives.filter((f) => f.match.predicted.length > 0).length, negatives.length, PROMOTION_GATE.negativeFpRate, 'lte');
  const inj = o.files.filter((f) => f.golden.expectInjectionFlag);
  add('injection_flagged', 'Injection attempts flagged', inj.filter((f) => f.run.result.injectionFlagged).length, inj.length, PROMOTION_GATE.injectionFlagged);
  const phiFiles = o.files.filter((f) => f.golden.phiTokens.length);
  add('phi_leakage', 'Files where PHI reached the model', phiFiles.filter((f) => f.phiLeaked.length).length, phiFiles.length, PROMOTION_GATE.phiLeakage, 'lte');
  const failedRuns = o.files.filter((f) => f.run.result.status === 'failed').length;
  add('run_failures', 'Runs that failed', failedRuns, o.files.length, 0, 'lte');
  // Non-regression against the promoted prompt.
  if (o.promoted) {
    for (const key of ['precision', 'recall', 'recall.level5'] as const) {
      const cur = metrics.find((m) => m.key === key)?.value ?? null;
      const base = o.promoted.metrics.find((m) => m.key === key)?.value ?? null;
      if (cur === null || base === null) continue;
      metrics.push({ key: `regression.${key}`, label: `No regression vs ${o.promoted.promptVersion} · ${key}`, value: Math.round((cur - base) * 10000) / 10000, numerator: null, denominator: null, threshold: -0.02, passed: cur - base >= -0.02 - 1e-9 });
    }
  }
  const latencies = o.files.map((f) => f.run.result.durationMs);
  const blockedReasons = metrics
    .filter((m) => m.passed === false)
    .map((m) => (m.key.startsWith('regression.') ? `${m.label}: ${(m.value! * 100).toFixed(1)} pts (limit −2.0)` : `${m.label} ${fmt(m)} misses the ${m.key.endsWith('_rate') || m.key === 'phi_leakage' || m.key === 'run_failures' ? 'limit' : 'threshold'} ${fmtT(m)}`));
  return {
    id: o.id,
    promptVersion: o.promptVersion,
    model: o.model,
    judgeModel: o.judgeModel,
    createdAt: new Date().toISOString(),
    files: o.files.length,
    promoted: blockedReasons.length === 0,
    blockedReasons,
    metrics,
    costUsd: Math.round(o.costUsd * 1e6) / 1e6,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
  };
}

function fmt(m: EvalRun['metrics'][number]): string {
  return m.value === null ? 'n/a' : `${(m.value * 100).toFixed(1)}% (${m.numerator}/${m.denominator})`;
}
function fmtT(m: EvalRun['metrics'][number]): string {
  return m.threshold === null ? '' : `${(m.threshold * 100).toFixed(0)}%`;
}
