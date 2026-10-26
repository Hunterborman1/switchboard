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

/**
 * Minutes a CSM spends today writing up and routing one call: the ONE registered baseline for
 * Signal Loop (an assumption until the 2-week time study replaces it). Must equal
 * baselineMinutesPerUnit in data/platform/agents.json (tests/unit/shared/baseline.test.ts), so
 * live runs and the six-week history credit hours the same way.
 */
export const MINUTES_SAVED_PER_CALL = 18;

/**
 * Budget: a typical run's cost, used for "can the remainder cover one more run" (the live flag).
 * Each run's reservation is sized from its own input instead (estimateRunCostUsd).
 */
export const RUN_COST_ESTIMATE_USD = 0.02;
/** At most this many live runs may hold an unsettled reservation at once (all viewers). */
export const MAX_UNSETTLED_RESERVATIONS = 8;
/** A reservation older than this is ignored (the run died without settling). */
export const RESERVATION_TTL_MS = 10 * 60_000;
/** Live runs that have not finished within this window fall back to replay (featured files). */
export const LIVE_FALLBACK_AFTER_MS = 25_000;

/** USD per 1M tokens (OpenRouter list prices), for estimates when the provider does not return usage.cost. */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'deepseek/deepseek-v4.1-flash': { in: 0.02, out: 1.0 },
  'anthropic/claude-haiku-5.5': { in: 0.1, out: 0.5 },
  'z-ai/glm-5.3-flash': { in: 0.15, out: 0.5 },
};

/**
 * Long inputs are extracted in overlapping windows of turns, in parallel (src/pipeline/chunk.ts):
 * above `thresholdChars` of rendered transcript, windows of about `windowChars`, each starting
 * with at least `overlapChars` of the previous window so an insight spanning a boundary is seen
 * whole at least once. Grounding still runs against the full document.
 */
export const EXTRACT_CHUNKING = { thresholdChars: 24_000, windowChars: 16_000, overlapChars: 2_000, concurrency: 8 } as const;

/** How many extraction windows an input of `chars` characters needs (1 = not chunked). */
export function extractWindowCount(chars: number): number {
  const c = EXTRACT_CHUNKING;
  if (chars <= c.thresholdChars) return 1;
  return Math.max(2, Math.ceil((chars - c.overlapChars) / (c.windowChars - c.overlapChars)));
}

/** Triage reads at most this much of the rendered input (src/shared/prompts/screen.ts triageTranscript). */
export const TRIAGE_MAX_CHARS = 40_000;

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICES[model] ?? { in: 0.5, out: 1.5 };
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

/** Conservative token count for text (≈3 characters per token; real English is closer to 4). */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 3);
}

/** Max output tokens of the second-opinion call (it grows with the number of insights). */
export const SECOND_OPINION_MAX_TOKENS = 1_500;

/**
 * Per-call shape of a live run: chain, max output tokens, extra input beyond the transcript, and
 * how much of the transcript the call reads.
 */
const RUN_CALLS = [
  { purpose: 'screen', tier: 'decision', maxOut: 400, extraIn: 1_500, reads: 'triage' },
  { purpose: 'extract', tier: 'primary', maxOut: 2_500, extraIn: 3_500, reads: 'windows' },
  // The second opinion and theme naming see insights and their quotes, not the transcript.
  { purpose: 'second_opinion', tier: 'decision', maxOut: SECOND_OPINION_MAX_TOKENS, extraIn: 3_500, reads: 'none' },
  { purpose: 'theme_name', tier: 'primary', maxOut: 600, extraIn: 1_500, reads: 'none' },
] as const;
/** The schema retry resends the input plus up to 6000 chars of the prior output. */
const RETRY_EXTRA_IN = estimateTokens(6_000) + 100;

/**
 * Worst-case cost of one live run, sized from its input: every call (triage, extraction in as
 * many windows as the input needs, the second opinion, theme naming) at its max output, with
 * every attempt its chain allows (primary tier: primary, schema retry, secondary; decision tier:
 * decision model, then the primary), priced at the dearest configured model, plus 20% margin.
 * This is what a run reserves.
 */
export function estimateRunCostUsd(contentChars: number, models: string[]): number {
  const prices = models.filter(Boolean).map((m) => MODEL_PRICES[m] ?? { in: 0.5, out: 1.5 });
  const pin = Math.max(...prices.map((p) => p.in), 0);
  const pout = Math.max(...prices.map((p) => p.out), 0);
  const windows = extractWindowCount(contentChars);
  let usd = 0;
  for (const c of RUN_CALLS) {
    // [input tokens per call, calls]
    const shape: [number, number] =
      c.reads === 'triage' ? [c.extraIn + estimateTokens(Math.min(contentChars, TRIAGE_MAX_CHARS)), 1]
        : c.reads === 'windows' ? [c.extraIn + estimateTokens(windows === 1 ? contentChars : EXTRACT_CHUNKING.windowChars), windows]
          : [c.extraIn, 1];
    const [input, calls] = shape;
    const attempts = c.tier === 'decision' ? [input, input] : [input, input + RETRY_EXTRA_IN, input];
    for (const tin of attempts) usd += (calls * (tin * pin + c.maxOut * pout)) / 1_000_000;
  }
  return Math.round(usd * 1.2 * 1e6) / 1e6;
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
