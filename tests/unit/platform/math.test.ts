import { describe, expect, it } from 'vitest';
import {
  acceptanceRate,
  costSlo,
  daysUntil,
  emptyOutcomes,
  evaluateRules,
  executiveSummary,
  hoursReturned,
  latencySlo,
  nextReviewDate,
  percentile,
  pctChange,
  ratioSlo,
  retentionCohorts,
  reviewStatus,
  roiMultiple,
  valueUsd,
  weekdayIndex,
  weeksBetween,
  weekStart,
  type RuleInput,
} from '../../../src/worker/platform/math';
import { isPlatformRequest } from '../../../src/worker/platform/ingest';

const base = { agentId: 'a', key: 'run_success', label: 'Run success', objective: '≥ 99%', window: '28 days' };

describe('impact math', () => {
  it('hours returned = (minutes saved − human minutes) / 60, rejected work counts against', () => {
    expect(hoursReturned({ minutesSaved: 240, humanMinutes: 60 })).toBe(3);
    expect(hoursReturned({ minutesSaved: 0, humanMinutes: 30 })).toBe(-0.5);
  });
  it('value = hours × loaded rate; ROI is null without spend', () => {
    expect(valueUsd(10, 85)).toBe(850);
    expect(roiMultiple(850, 10)).toBe(85);
    expect(roiMultiple(850, 0)).toBeNull();
  });
  it('acceptance = (accepted + automatic) / all; null when empty', () => {
    expect(acceptanceRate(emptyOutcomes())).toBeNull();
    expect(acceptanceRate({ accepted: 2, edited: 1, rejected: 1, automatic: 4, failed: 2 })).toBe(0.6);
  });
  it('percent change needs a positive prior', () => {
    expect(pctChange(12, 10)).toBeCloseTo(0.2);
    expect(pctChange(5, 0)).toBeNull();
  });
});

describe('calendar', () => {
  it('weeks start on Monday (UTC)', () => {
    expect(weekStart('2026-10-24T12:00:00Z')).toBe('2026-10-19'); // Saturday → Monday
    expect(weekStart('2026-09-14')).toBe('2026-09-14');
    expect(weekdayIndex('2026-09-14')).toBe(0);
    expect(weeksBetween('2026-09-14', '2026-10-24')).toHaveLength(6);
  });
});

describe('review status', () => {
  const now = '2026-10-24T10:00:00Z';
  it('computes next review from cadence', () => {
    expect(nextReviewDate('2026-09-19', 45)).toBe('2026-11-03');
    expect(daysUntil('2026-11-03', now)).toBe(10);
  });
  it('overdue once the date has passed, due soon within 14 days, else current', () => {
    expect(reviewStatus('2026-10-23', now)).toBe('overdue');
    expect(reviewStatus('2026-10-24', now)).toBe('due_soon');
    expect(reviewStatus('2026-11-07', now)).toBe('due_soon');
    expect(reviewStatus('2026-11-08', now)).toBe('current');
  });
});

describe('SLOs and error budgets', () => {
  it('ratio SLO: meeting with budget left', () => {
    const s = ratioSlo(base, 999, 1000, 0.99);
    expect(s.status).toBe('ok');
    expect(s.errorBudgetRemaining).toBeCloseTo(0.9);
  });
  it('ratio SLO: at risk under 25% budget, breached below target', () => {
    expect(ratioSlo(base, 120, 121, 0.99).status).toBe('at_risk');
    const b = ratioSlo(base, 97, 100, 0.99);
    expect(b.status).toBe('breached');
    expect(b.errorBudgetRemaining).toBeLessThan(0);
  });
  it('no events is no data, never success', () => {
    const s = ratioSlo(base, 0, 0, 0.99);
    expect(s.status).toBe('no_data');
    expect(s.actual).toBeNull();
  });
  it('latency SLO budget is the 5% allowed over threshold; breached iff p95 > target', () => {
    expect(latencySlo({ ...base, key: 'p95_latency' }, 800, 2, 100, 900).status).toBe('ok');
    expect(latencySlo({ ...base, key: 'p95_latency' }, 950, 6, 100, 900).status).toBe('breached');
    expect(latencySlo({ ...base, key: 'p95_latency' }, null, 0, 0, 900).status).toBe('no_data');
  });
  it('cost SLO compares average cost per unit with the ceiling', () => {
    expect(costSlo({ ...base, key: 'cost_per_unit' }, 1, 100, 0.02).status).toBe('ok');
    expect(costSlo({ ...base, key: 'cost_per_unit' }, 3, 100, 0.02).status).toBe('breached');
  });
  it('percentile uses nearest rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('retention cohorts', () => {
  it('cohort = week of first activity; weeks[i] = share active i weeks later', () => {
    const a = new Map<string, Set<number>>([
      ['u1', new Set([0, 1, 2])],
      ['u2', new Set([0, 2])],
      ['u3', new Set([1])],
    ]);
    const r = retentionCohorts(a, ['w0', 'w1', 'w2']);
    expect(r[0]).toEqual({ cohortWeek: 'w0', size: 2, weeks: [1, 0.5, 1] });
    expect(r[1]).toEqual({ cohortWeek: 'w1', size: 1, weeks: [1, 0] });
    expect(r[2]!.size).toBe(0);
  });
});

describe('alert rules', () => {
  const input = (over: Partial<RuleInput> = {}): RuleInput => ({
    agentId: 'agt_x',
    agentName: 'X',
    owner: 'Owner',
    runbook: 'https://runbook',
    windowEnd: '2026-10-24T23:59:59.999Z',
    slos: [],
    hourlyErrorRate: [],
    cost7d: 10,
    costPrior7d: 10,
    wau: 10,
    priorWau: 10,
    reviewStatus: 'current',
    nextReview: '2026-11-30',
    standardGaps: [],
    status: 'production',
    ...over,
  });
  it('fires nothing on a healthy agent', () => {
    expect(evaluateRules(input())).toEqual([]);
  });
  it('fires each rule with expected vs actual and a stable id', () => {
    const alerts = evaluateRules(
      input({
        slos: [ratioSlo(base, 90, 100, 0.99)],
        hourlyErrorRate: [{ hour: '2026-10-24T15:00:00.000Z', requests: 40, errors: 8 }],
        cost7d: 20,
        costPrior7d: 10,
        wau: 4,
        priorWau: 10,
        reviewStatus: 'overdue',
        nextReview: '2026-10-20',
        budget: { limitUsd: 15, spentUsd: 13 },
      }),
    );
    const rules = alerts.map((a) => a.rule);
    expect(rules.some((r) => r.startsWith('SLO breached'))).toBe(true);
    expect(rules).toContain('Error rate > 5% in an hour (≥ 20 requests)');
    expect(rules).toContain('AI cost up > 50% week over week');
    expect(rules).toContain('Weekly active users down > 30%');
    expect(rules).toContain('Live AI spend > 80% of cap');
    expect(rules).toContain('Scheduled review overdue');
    expect(alerts.find((a) => a.rule.startsWith('SLO'))!.severity).toBe('critical');
    expect(new Set(alerts.map((a) => a.id)).size).toBe(alerts.length);
    expect(alerts.every((a) => a.status === 'open' && a.expected && a.actual)).toBe(true);
  });
  it('ignores small denominators and retired agents', () => {
    expect(evaluateRules(input({ hourlyErrorRate: [{ hour: 'h', requests: 5, errors: 3 }], priorWau: 3, wau: 0, costPrior7d: 1, cost7d: 9 }))).toEqual([]);
    expect(evaluateRules(input({ status: 'retired', reviewStatus: 'overdue' }))).toEqual([]);
  });
});

describe('executive summary', () => {
  it('produces 4–5 sentences from the numbers', () => {
    const s = executiveSummary({
      periodLabel: 'the last 6 weeks',
      agentsInProduction: 2,
      hoursReturned: 121.4,
      valueUsd: 10319,
      aiCostUsd: 39.2,
      roiMultiple: 263,
      loadedHourlyUsd: 85,
      activeUsers: 9,
      wau: 9,
      priorWau: 8,
      topAgent: { name: 'RFP Responder', hours: 88, share: 0.72 },
      attention: [{ kind: 'standard_gap', message: 'x' }],
      acceptanceRate: 0.64,
    });
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s[0]).toContain('saved an estimated 121 hours');
    expect(s[0]).toContain('$10,319');
    expect(s[2]).toContain('up 13%');
    expect(s[3]).toContain('1 standard gap');
    expect(s.join(' ')).toContain('2-week time study');
  });
});

describe('ingest filters', () => {
  it('drops the platform’s own API traffic from an agent’s request logs', () => {
    expect(isPlatformRequest('http.request', '/repo/invoca/api/platform/overview')).toBe(true);
    expect(isPlatformRequest('http.request', 'GET /platform/logs → 200 (5ms)')).toBe(true);
    expect(isPlatformRequest('http.request', '/repo/invoca/api/runs')).toBe(false);
    expect(isPlatformRequest('ai.call', '/repo/invoca/api/platform/x')).toBe(false);
  });
});
