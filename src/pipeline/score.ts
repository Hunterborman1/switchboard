/**
 * Score + gate. final = model confidence × grounding × type prior × account context.
 *   ≥ 0.80 auto_route · 0.55–0.80 review · < 0.55 held · no grounded quote → dropped.
 *   churn_risk and high/critical bugs always go to review; so does everything in a file
 *   where a prompt injection was suspected.
 */
import { THRESHOLDS, type Account, type Evidence, type Gate, type InsightStatus, type InsightType, type Severity } from '../shared/contracts.ts';
import { ACCOUNT_CONTEXT, TYPE_PRIORS } from '../shared/scoring.ts';
import { clamp01, round } from './util.ts';

export type Thresholds = { autoRoute: number; review: number; grounding: number };

export function accountFactor(account: Account | null, now: number): { factor: number; notes: string[] } {
  if (!account) return { factor: ACCOUNT_CONTEXT.noAccount, notes: ['no account context'] };
  let f: number = ACCOUNT_CONTEXT.base;
  const notes: string[] = [];
  const days = (Date.parse(`${account.renewalDate}T00:00:00Z`) - now) / 86_400_000;
  if (Number.isFinite(days) && days >= 0 && days <= ACCOUNT_CONTEXT.renewalWithinDays) {
    f *= ACCOUNT_CONTEXT.renewalSoon;
    notes.push(`renewal in ${Math.round(days)} days`);
  }
  if (account.health === 'at_risk') {
    f *= ACCOUNT_CONTEXT.atRisk;
    notes.push('account at risk');
  } else if (account.health === 'watch') {
    f *= ACCOUNT_CONTEXT.watch;
    notes.push('account on watch');
  }
  return { factor: f, notes };
}

export type ScoreInput = {
  type: InsightType;
  severity: Severity;
  confidenceModel: number;
  evidence: Evidence[];
  account: Account | null;
  injectionFlagged: boolean;
  now: number;
  thresholds?: Thresholds;
  /** Extra reasons that send the insight to review whatever its confidence (e.g. screen failed). */
  forceReview?: string[];
};

export type ScoreResult = {
  groundingScore: number;
  confidenceFinal: number;
  gate: Gate;
  status: InsightStatus;
  gateReasons: string[];
};

const f2 = (n: number) => n.toFixed(2);

export function scoreInsight(input: ScoreInput): ScoreResult {
  const t = input.thresholds ?? THRESHOLDS;
  const grounded = input.evidence.filter((e) => e.method !== 'failed');
  if (!grounded.length) {
    const best = Math.max(0, ...input.evidence.map((e) => e.score));
    return {
      groundingScore: round(best, 3),
      confidenceFinal: 0,
      gate: 'dropped',
      status: 'dropped_ungrounded',
      gateReasons: [`no quote could be grounded (best match ${f2(best)} < ${f2(t.grounding)})`],
    };
  }
  const groundingScore = Math.max(...grounded.map((e) => e.score));
  const prior = TYPE_PRIORS[input.type];
  const ctx = accountFactor(input.account, input.now);
  const confidenceFinal = round(clamp01(clamp01(input.confidenceModel) * groundingScore * prior * ctx.factor), 3);
  const reasons: string[] = [];
  let gate: Gate;
  if (confidenceFinal >= t.autoRoute) {
    gate = 'auto_route';
    reasons.push(`confidence ${f2(confidenceFinal)} ≥ ${f2(t.autoRoute)}`);
  } else if (confidenceFinal >= t.review) {
    gate = 'review';
    reasons.push(`confidence ${f2(confidenceFinal)} < ${f2(t.autoRoute)}`);
  } else {
    gate = 'held';
    reasons.push(`confidence ${f2(confidenceFinal)} < ${f2(t.review)}`);
  }
  const failed = input.evidence.length - grounded.length;
  if (failed) reasons.push(`${failed} of ${input.evidence.length} quotes failed grounding`);
  const forceReview: string[] = [];
  if (input.type === 'churn_risk') forceReview.push('churn risk is always reviewed');
  if (input.type === 'bug' && (input.severity === 'critical' || input.severity === 'high')) forceReview.push(`${input.severity} bug is always reviewed`);
  if (input.injectionFlagged) forceReview.push('prompt injection suspected in this file: a person reviews everything');
  forceReview.push(...(input.forceReview ?? []));
  if (forceReview.length) {
    gate = 'review';
    reasons.push(...forceReview);
  }
  if (ctx.notes.length && gate !== 'held') reasons.push(`account context ×${ctx.factor.toFixed(2)} (${ctx.notes.join(', ')})`);
  const status: InsightStatus = gate === 'auto_route' ? 'routed' : gate === 'review' ? 'pending_review' : 'held';
  return { groundingScore: round(groundingScore, 3), confidenceFinal, gate, status, gateReasons: reasons };
}
