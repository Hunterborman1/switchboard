import { describe, expect, it } from 'vitest';
import { accountFactor, scoreInsight, type ScoreInput } from '../../../src/pipeline/score.ts';
import type { Evidence } from '../../../src/shared/contracts.ts';
import { account } from '../../helpers/fixtures.ts';

const NOW = Date.parse('2026-10-24T00:00:00Z');
const ok: Evidence = { quote: 'q', turnId: 't001', start: 0, end: 1, matchedText: 'q', score: 1, method: 'exact' };
const fuzzy = (score: number): Evidence => ({ ...ok, score, method: 'fuzzy' });
const failed = (score = 0.6): Evidence => ({ ...ok, start: null, end: null, matchedText: null, score, method: 'failed' });
const healthy = { ...account('acct_sunpeak'), renewalDate: '2028-01-01' }; // factor 1.0
const base: ScoreInput = { type: 'feature_request', severity: 'medium', confidenceModel: 0.9, evidence: [ok], account: healthy, injectionFlagged: false, now: NOW };

describe('scoreInsight', () => {
  it('final = model × grounding × prior × account', () => {
    const r = scoreInsight({ ...base, type: 'pricing_objection', evidence: [fuzzy(0.95)] });
    expect(r.confidenceFinal).toBeCloseTo(0.9 * 0.95 * 0.97, 3);
    expect(r.groundingScore).toBe(0.95);
  });
  it('gate boundaries: ≥0.80 auto, 0.55–0.80 review, <0.55 held', () => {
    expect(scoreInsight({ ...base, confidenceModel: 0.8 }).gate).toBe('auto_route');
    expect(scoreInsight({ ...base, confidenceModel: 0.799 }).gate).toBe('review');
    expect(scoreInsight({ ...base, confidenceModel: 0.55 }).gate).toBe('review');
    expect(scoreInsight({ ...base, confidenceModel: 0.549 }).gate).toBe('held');
    expect(scoreInsight({ ...base, confidenceModel: 0.71 }).gateReasons[0]).toBe('confidence 0.71 < 0.80');
    expect(scoreInsight({ ...base, confidenceModel: 0.3 }).gateReasons[0]).toBe('confidence 0.30 < 0.55');
    expect(scoreInsight({ ...base, confidenceModel: 0.9 }).gateReasons[0]).toBe('confidence 0.90 ≥ 0.80');
  });
  it('status follows the gate', () => {
    expect(scoreInsight({ ...base }).status).toBe('routed');
    expect(scoreInsight({ ...base, confidenceModel: 0.6 }).status).toBe('pending_review');
    expect(scoreInsight({ ...base, confidenceModel: 0.2 }).status).toBe('held');
  });
  it('churn risk is always reviewed, even when confident or low', () => {
    const hi = scoreInsight({ ...base, type: 'churn_risk', confidenceModel: 0.99 });
    expect(hi.gate).toBe('review');
    expect(hi.gateReasons).toContain('churn risk is always reviewed');
    expect(scoreInsight({ ...base, type: 'churn_risk', confidenceModel: 0.2 }).gate).toBe('review');
  });
  it('high and critical bugs are always reviewed; low/medium bugs are not', () => {
    expect(scoreInsight({ ...base, type: 'bug', severity: 'critical' }).gateReasons).toContain('critical bug is always reviewed');
    expect(scoreInsight({ ...base, type: 'bug', severity: 'high' }).gate).toBe('review');
    expect(scoreInsight({ ...base, type: 'bug', severity: 'medium' }).gate).toBe('auto_route');
    expect(scoreInsight({ ...base, type: 'feature_request', severity: 'critical' }).gate).toBe('auto_route');
  });
  it('a suspected injection sends everything to review', () => {
    const r = scoreInsight({ ...base, injectionFlagged: true });
    expect(r.gate).toBe('review');
    expect(r.gateReasons.some((x) => x.includes('injection'))).toBe(true);
  });
  it('no grounded quote → dropped as ungrounded', () => {
    const r = scoreInsight({ ...base, evidence: [failed(0.62)] });
    expect(r).toMatchObject({ gate: 'dropped', status: 'dropped_ungrounded', confidenceFinal: 0 });
    expect(r.gateReasons[0]).toBe('no quote could be grounded (best match 0.62 < 0.90)');
    expect(scoreInsight({ ...base, evidence: [] }).gate).toBe('dropped');
  });
  it('a partially grounded insight survives and says how many quotes failed', () => {
    const r = scoreInsight({ ...base, evidence: [ok, failed()] });
    expect(r.gate).toBe('auto_route');
    expect(r.gateReasons).toContain('1 of 2 quotes failed grounding');
  });
  it('custom thresholds apply', () => {
    expect(scoreInsight({ ...base, confidenceModel: 0.85, thresholds: { autoRoute: 0.9, review: 0.5, grounding: 0.9 } }).gate).toBe('review');
  });
  it('clamps model confidence', () => {
    expect(scoreInsight({ ...base, confidenceModel: 1.7 }).confidenceFinal).toBeLessThanOrEqual(1);
  });
});

describe('accountFactor', () => {
  it('renewal soon and health raise it; no account lowers it', () => {
    const soon = { ...healthy, renewalDate: '2026-12-01', health: 'at_risk' as const };
    const f = accountFactor(soon, NOW);
    expect(f.factor).toBeGreaterThan(1);
    expect(f.notes.join(' ')).toMatch(/renewal in \d+ days.*account at risk/);
    expect(accountFactor(null, NOW).factor).toBeLessThan(1);
    expect(accountFactor(healthy, NOW).factor).toBe(1);
    expect(accountFactor({ ...healthy, renewalDate: '2020-01-01' }, NOW).factor).toBe(1);
  });
});
