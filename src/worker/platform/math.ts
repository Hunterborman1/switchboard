/**
 * Agent Ops arithmetic: pure, deterministic, unit-tested (tests/unit/platform). The SQL layer
 * gathers sums and counts; every number a viewer reads is finished here so the rules (what
 * counts as "hours returned", when an SLO is breached, when a review is overdue) live in one
 * place. Imported by the Worker, the simulator and the UI, so it uses no runtime globals.
 */
import type { Alert, Slo } from '../../shared/platform-contracts.ts';
import type { ReviewStatus } from './types.ts';

export const DAY_MS = 86_400_000;
export const DEFAULT_LOADED_HOURLY_USD = 85;
export const DUE_SOON_DAYS = 14;

// ---------------------------------------------------------------- dates

export function isoDay(t: string | number | Date): string {
  return new Date(t).toISOString().slice(0, 10);
}
export function addDays(t: string | number | Date, days: number): string {
  return new Date(new Date(t).getTime() + days * DAY_MS).toISOString();
}
/** Monday (UTC) of the week containing t, as YYYY-MM-DD. */
export function weekStart(t: string | number | Date): string {
  const d = new Date(t);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
}
/** Every Monday from the week of `from` to the week of `to`, inclusive. */
export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let w = weekStart(from);
  const last = weekStart(to);
  while (w <= last) {
    out.push(w);
    w = isoDay(addDays(w, 7));
  }
  return out;
}
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = isoDay(from);
  const last = isoDay(to);
  while (d <= last) {
    out.push(d);
    d = isoDay(addDays(d, 1));
  }
  return out;
}
/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(t: string | number | Date): number {
  return (new Date(t).getUTCDay() + 6) % 7;
}

// ---------------------------------------------------------------- impact

export type UnitSums = { units: number; minutesSaved: number; humanMinutes: number; aiCostUsd: number };

/** Hours returned = Σ(minutesSavedEstimate − humanMinutesSpent) / 60. Rejected work counts against. */
export function hoursReturned(s: Pick<UnitSums, 'minutesSaved' | 'humanMinutes'>): number {
  return (s.minutesSaved - s.humanMinutes) / 60;
}
export function valueUsd(hours: number, loadedHourlyUsd: number): number {
  return hours * loadedHourlyUsd;
}
/** Value per dollar of AI spend. Null when there is no spend (a ratio over zero is not a number). */
export function roiMultiple(value: number, cost: number): number | null {
  if (!(cost > 0)) return null;
  return value / cost;
}
export type Outcomes = Record<'accepted' | 'edited' | 'rejected' | 'automatic' | 'failed', number>;
export function emptyOutcomes(): Outcomes {
  return { accepted: 0, edited: 0, rejected: 0, automatic: 0, failed: 0 };
}
/** (accepted + automatic) / all work units. Null with no units. */
export function acceptanceRate(o: Outcomes): number | null {
  const all = o.accepted + o.edited + o.rejected + o.automatic + o.failed;
  if (!all) return null;
  return (o.accepted + o.automatic) / all;
}
/** Per-unit minutes the platform credits for an outcome, from the agent's registered baseline. */
export function creditedMinutes(outcome: keyof Outcomes, baselineMinutes: number): number {
  return outcome === 'accepted' || outcome === 'edited' || outcome === 'automatic' ? baselineMinutes : 0;
}
export function pctChange(current: number, prior: number): number | null {
  if (!(prior > 0)) return null;
  return (current - prior) / prior;
}

// ---------------------------------------------------------------- reviews

export function nextReviewDate(lastReview: string, cadenceDays: number): string {
  return isoDay(addDays(lastReview, cadenceDays));
}
export function daysUntil(date: string, now: string | number | Date): number {
  const a = Date.parse(isoDay(date));
  const b = Date.parse(isoDay(now));
  return Math.round((a - b) / DAY_MS);
}
/** overdue once the review date has passed; due soon within 14 days; otherwise current. */
export function reviewStatus(nextReview: string, now: string | number | Date, dueSoonDays = DUE_SOON_DAYS): ReviewStatus {
  const d = daysUntil(nextReview, now);
  if (d < 0) return 'overdue';
  if (d <= dueSoonDays) return 'due_soon';
  return 'current';
}

// ---------------------------------------------------------------- percentiles

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
}

// ---------------------------------------------------------------- SLOs

type SloBase = Pick<Slo, 'agentId' | 'key' | 'label' | 'objective' | 'window'>;
const AT_RISK_BUDGET = 0.25;

function statusFromBudget(remaining: number): Slo['status'] {
  if (remaining < 0) return 'breached';
  if (remaining < AT_RISK_BUDGET) return 'at_risk';
  return 'ok';
}

/**
 * Ratio SLO (good / total ≥ target). Error budget = allowed bad fraction (1 − target);
 * remaining = 1 − consumed / budget. Breached when actual < target (remaining < 0).
 */
export function ratioSlo(base: SloBase, good: number, total: number, target: number): Slo {
  if (!total) return { ...base, target, actual: null, numerator: null, denominator: null, status: 'no_data', errorBudgetRemaining: null };
  const actual = good / total;
  const budget = 1 - target;
  const consumed = 1 - actual;
  const remaining = budget > 0 ? 1 - consumed / budget : actual >= target ? 1 : -1;
  return { ...base, target, actual, numerator: good, denominator: total, status: statusFromBudget(remaining), errorBudgetRemaining: remaining };
}

/**
 * Latency SLO: p95 ≤ target. The budget is the 5% of requests allowed above the threshold;
 * remaining = 1 − (share over threshold / 5%). Breached iff p95 > target.
 */
export function latencySlo(base: SloBase, p95: number | null, over: number, total: number, targetMs: number): Slo {
  if (!total || p95 == null) return { ...base, target: targetMs, actual: null, numerator: null, denominator: null, status: 'no_data', errorBudgetRemaining: null };
  const share = over / total;
  let remaining = 1 - share / 0.05;
  if (p95 > targetMs && remaining >= 0) remaining = -0.001;
  if (p95 <= targetMs && remaining < 0) remaining = 0;
  return { ...base, target: targetMs, actual: p95, numerator: total - over, denominator: total, status: statusFromBudget(remaining), errorBudgetRemaining: remaining };
}

/** Cost ceiling SLO: average cost per unit ≤ target. remaining = (target − actual) / target. */
export function costSlo(base: SloBase, costUsd: number, units: number, targetUsd: number): Slo {
  if (!units) return { ...base, target: targetUsd, actual: null, numerator: null, denominator: null, status: 'no_data', errorBudgetRemaining: null };
  const actual = costUsd / units;
  const remaining = (targetUsd - actual) / targetUsd;
  return { ...base, target: targetUsd, actual, numerator: null, denominator: units, status: statusFromBudget(remaining), errorBudgetRemaining: remaining };
}

// ---------------------------------------------------------------- retention

/**
 * Weekly retention cohorts. Input: for each actor, the set of week indexes (0 = first week of
 * the period) in which they were active. A cohort is the week of first activity; weeks[i] is
 * the share of that cohort active i weeks later (weeks[0] is always 1).
 */
export function retentionCohorts(activity: Map<string, Set<number>>, weekLabels: string[]): { cohortWeek: string; size: number; weeks: number[] }[] {
  const cohorts = weekLabels.map(() => [] as Set<number>[]);
  for (const weeks of activity.values()) {
    if (!weeks.size) continue;
    const first = Math.min(...weeks);
    if (first < 0 || first >= weekLabels.length) continue;
    cohorts[first]!.push(weeks);
  }
  return weekLabels.map((label, c) => {
    const members = cohorts[c]!;
    const size = members.length;
    const weeks: number[] = [];
    for (let i = 0; c + i < weekLabels.length; i++) {
      weeks.push(size ? members.filter((w) => w.has(c + i)).length / size : 0);
    }
    return { cohortWeek: label, size, weeks };
  });
}

// ---------------------------------------------------------------- alert rules

export type RuleInput = {
  agentId: string;
  agentName: string;
  owner: string;
  runbook: string;
  windowEnd: string;
  slos: Slo[];
  hourlyErrorRate: { hour: string; requests: number; errors: number }[];
  cost7d: number;
  costPrior7d: number;
  wau: number;
  priorWau: number;
  reviewStatus: ReviewStatus;
  nextReview: string;
  standardGaps: string[];
  budget?: { limitUsd: number; spentUsd: number };
  status: 'production' | 'pilot' | 'in_review' | 'retired';
};

export const RULES = {
  sloBreach: 'SLO breached',
  errorBurst: 'Error rate > 5% in an hour (≥ 20 requests)',
  costSpike: 'AI cost up > 50% week over week',
  adoptionDrop: 'Weekly active users down > 30%',
  budget: 'Live AI spend > 80% of cap',
  reviewOverdue: 'Scheduled review overdue',
} as const;

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
function fmtSloValue(s: Slo, v: number): string {
  if (s.key === 'p95_latency') return `${Math.round(v).toLocaleString('en-US')} ms`;
  if (s.key === 'cost_per_unit') return `$${v.toFixed(3)}`;
  return fmtPct(v);
}

/** Evaluate the platform's alert rules for one agent. Deterministic ids per agent+rule+day. */
export function evaluateRules(i: RuleInput): Alert[] {
  if (i.status === 'retired') return [];
  const day = isoDay(i.windowEnd);
  const out: Alert[] = [];
  const base = { agentId: i.agentId, at: i.windowEnd, status: 'open' as const, owner: i.owner, runbook: i.runbook, traceId: null };
  for (const s of i.slos) {
    if (s.status !== 'breached' || s.actual == null) continue;
    const cmp = s.key === 'p95_latency' || s.key === 'cost_per_unit' ? '≤' : '≥';
    out.push({ ...base, id: `alr_${i.agentId}_slo_${s.key}_${day}`, severity: s.key === 'run_success' || s.key === 'delivery_success' ? 'critical' : 'warning', rule: `${RULES.sloBreach}: ${s.label}`, expected: `${cmp} ${fmtSloValue(s, s.target)} (${s.window})`, actual: fmtSloValue(s, s.actual) });
  }
  const worst = i.hourlyErrorRate.filter((h) => h.requests >= 20 && h.errors / h.requests > 0.05).sort((a, b) => b.errors / b.requests - a.errors / a.requests)[0];
  if (worst) {
    out.push({ ...base, id: `alr_${i.agentId}_errors_${day}`, at: worst.hour, severity: 'warning', rule: RULES.errorBurst, expected: '≤ 5.0% errors per hour', actual: `${fmtPct(worst.errors / worst.requests)} (${worst.errors} of ${worst.requests}) at ${worst.hour.slice(11, 16)} UTC` });
  }
  if (i.costPrior7d >= 5 && i.cost7d > i.costPrior7d * 1.5) {
    out.push({ ...base, id: `alr_${i.agentId}_cost_${day}`, severity: 'warning', rule: RULES.costSpike, expected: `≤ $${(i.costPrior7d * 1.5).toFixed(2)} (1.5 × prior week $${i.costPrior7d.toFixed(2)})`, actual: `$${i.cost7d.toFixed(2)} (+${Math.round((i.cost7d / i.costPrior7d - 1) * 100)}%)` });
  }
  if (i.priorWau >= 5 && i.wau < i.priorWau * 0.7) {
    out.push({ ...base, id: `alr_${i.agentId}_adoption_${day}`, severity: 'warning', rule: RULES.adoptionDrop, expected: `≥ ${Math.ceil(i.priorWau * 0.7)} users (70% of prior ${i.priorWau})`, actual: `${i.wau} users (${Math.round((i.wau / i.priorWau - 1) * 100)}%)` });
  }
  if (i.budget && i.budget.limitUsd > 0 && i.budget.spentUsd > i.budget.limitUsd * 0.8) {
    out.push({ ...base, id: `alr_${i.agentId}_budget_${day}`, severity: i.budget.spentUsd >= i.budget.limitUsd ? 'critical' : 'warning', rule: RULES.budget, expected: `≤ $${(i.budget.limitUsd * 0.8).toFixed(2)} of $${i.budget.limitUsd.toFixed(2)}`, actual: `$${i.budget.spentUsd.toFixed(2)}` });
  }
  if (i.reviewStatus === 'overdue') {
    out.push({ ...base, id: `alr_${i.agentId}_review_${day}`, severity: 'info', rule: RULES.reviewOverdue, expected: `Review by ${isoDay(i.nextReview)}`, actual: `${-daysUntil(i.nextReview, i.windowEnd)} days overdue` });
  }
  return out;
}

// ---------------------------------------------------------------- executive summary

export type SummaryInput = {
  periodLabel: string;
  agentsInProduction: number;
  hoursReturned: number;
  valueUsd: number;
  aiCostUsd: number;
  roiMultiple: number | null;
  loadedHourlyUsd: number;
  activeUsers: number;
  wau: number;
  priorWau: number;
  topAgent: { name: string; hours: number; share: number } | null;
  attention: { kind: string; message: string }[];
  acceptanceRate: number | null;
};

function money(v: number): string {
  if (Math.abs(v) >= 1000) return `$${Math.round(v).toLocaleString('en-US')}`;
  return `$${v.toFixed(2)}`;
}
function hrs(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

/** Four to five plain sentences for leadership, generated from the numbers by template. */
export function executiveSummary(s: SummaryInput): string[] {
  const out: string[] = [];
  out.push(
    `Over ${s.periodLabel}, ${s.agentsInProduction} production agents returned an estimated ~${hrs(s.hoursReturned)} hours of employee time, worth ~${money(s.valueUsd)} at a loaded $${s.loadedHourlyUsd}/hour, for ${money(s.aiCostUsd)} in AI spend${s.roiMultiple != null ? ` (~${Math.round(s.roiMultiple)}× return on AI cost)` : ''}.`,
  );
  if (s.topAgent) {
    out.push(`${s.topAgent.name} contributed the most, ${hrs(s.topAgent.hours)} hours (${Math.round(s.topAgent.share * 100)}% of the total).`);
  }
  const delta = s.priorWau > 0 ? Math.round(((s.wau - s.priorWau) / s.priorWau) * 100) : null;
  out.push(
    `${s.activeUsers} people used at least one agent in the period; ${s.wau} were active in the latest week${delta != null ? ` (${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)}% on the week before)` : ''}${s.acceptanceRate != null ? `, and ${Math.round(s.acceptanceRate * 100)}% of agent output was accepted as-is or ran automatically` : ''}.`,
  );
  const counts = new Map<string, number>();
  for (const a of s.attention) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  if (s.attention.length) {
    const words: Record<string, [string, string]> = {
      review_overdue: ['overdue review', 'overdue reviews'],
      slo_breached: ['SLO breach', 'SLO breaches'],
      standard_gap: ['standard gap', 'standard gaps'],
      cost_spike: ['cost spike', 'cost spikes'],
      adoption_drop: ['adoption drop', 'adoption drops'],
    };
    const parts = [...counts.entries()].map(([k, n]) => `${n} ${(words[k] ?? [k, k])[n === 1 ? 0 : 1]}`);
    out.push(`${s.attention.length} items need attention: ${parts.join(', ')}; each has a named owner and a linked runbook.`);
  } else {
    out.push('No agent has an overdue review, SLO breach or standard gap this period.');
  }
  out.push('Hours are estimates from registered per-task baselines, to be validated with a 2-week time study; cost is metered model spend, not billing data.');
  return out;
}
