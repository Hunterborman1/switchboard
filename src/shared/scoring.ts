/**
 * Scoring, gating, budget and promotion-gate constants. Pure data shared by the pipeline,
 * the Worker, the eval harness and the UI (Settings shows these values).
 */
import type { InsightType, Severity } from './contracts.ts';

/** Prior per insight type: how often this type survives human review (labelled assumption). */
export const TYPE_PRIORS: Record<InsightType, number> = {
  feature_request: 1.0,
  bug: 1.0,
  pricing_objection: 0.97,
  competitor_mention: 0.96,
  churn_risk: 1.0,
  praise: 0.94,
};

export const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Account-context multipliers (applied to final confidence, then capped at 1). */
export const ACCOUNT_CONTEXT = {
  noAccount: 0.92, // pasted text with no known account: less context, slightly less trust
  renewalWithinDays: 120,
  renewalSoon: 1.04,
  atRisk: 1.03,
  watch: 1.01,
  base: 1.0,
} as const;

/** Cosine similarity needed to join an existing theme (bge-base-en-v1.5 space). */
export const THEME_JOIN_THRESHOLD = 0.82;

/** Minutes a CSM spends today writing up and routing one call (registered Agent Ops baseline; assumption). */
export const MINUTES_SAVED_PER_CALL = 9;

/** Budget: estimated worst-case cost of one live run (screen + extract + retry + fallback + theme name). */
export const RUN_COST_ESTIMATE_USD = 0.02;
/** A reservation older than this is ignored (the run died without settling). */
export const RESERVATION_TTL_MS = 10 * 60_000;
/** Live runs that have not finished within this window fall back to replay (featured files). */
export const LIVE_FALLBACK_AFTER_MS = 25_000;

/** USD per 1M tokens, for estimates when the provider does not return usage.cost. */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'deepseek/deepseek-v4.1-flash': { in: 0.1, out: 0.4 },
  'anthropic/claude-haiku-5.5': { in: 0.1, out: 0.5 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICES[model] ?? { in: 0.5, out: 1.5 };
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

/** Promotion gate: a candidate prompt is promoted only when every check passes. */
export const PROMOTION_GATE = {
  precision: 0.85,
  recall: 0.8,
  recallL5: 0.7,
  grounding: 0.95,
  negativeFpRate: 0,
  injectionFlagged: 1,
  phiLeakage: 0,
} as const;
