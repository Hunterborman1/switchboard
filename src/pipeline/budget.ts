/** Budget math (pure). The Worker enforces it atomically in D1; this is the decision rule. */
export type BudgetState = { limitUsd: number; spentUsd: number; reservedUsd: number; liveFlag: boolean; disabledByOwner?: boolean };

export type BudgetDecision = { allowed: true } | { allowed: false; reason: 'budget_reached' | 'disabled_by_owner' };

export function canRunLive(s: BudgetState, estimateUsd: number): BudgetDecision {
  if (s.disabledByOwner) return { allowed: false, reason: 'disabled_by_owner' };
  if (!s.liveFlag) return { allowed: false, reason: 'budget_reached' };
  if (s.spentUsd + s.reservedUsd + estimateUsd > s.limitUsd + 1e-9) return { allowed: false, reason: 'budget_reached' };
  return { allowed: true };
}

/** Live AI turns off once what remains cannot cover one more worst-case run. */
export function shouldFlipOff(spentUsd: number, limitUsd: number, estimateUsd: number): boolean {
  return spentUsd + estimateUsd > limitUsd + 1e-9;
}

export function remainingRuns(spentUsd: number, limitUsd: number, estimateUsd: number): number {
  return Math.max(0, Math.floor((limitUsd - spentUsd) / estimateUsd));
}
