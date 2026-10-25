import { describe, expect, it } from 'vitest';
import { assignThemes, cosine, hashEmbed, themeText } from '../../../src/pipeline/theme.ts';
import { bestQuote, deliverInsight, hitsTransientFailure, projectKey, renderPayload, routedNotification, shippedNotification } from '../../../src/pipeline/deliver.ts';
import { canRunLive, remainingRuns, shouldFlipOff } from '../../../src/pipeline/budget.ts';
import type { Insight } from '../../../src/shared/contracts.ts';
import { account, world } from '../../helpers/fixtures.ts';

const unit = (i: number, n = 4) => Array.from({ length: n }, (_, k) => (k === i ? 1 : 0));
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x * (1 - t) + b[i]! * t);

describe('theme assignment', () => {
  it('joins the nearest existing theme of the same type above the threshold', () => {
    const a = assignThemes([{ key: 'i1', type: 'bug', productArea: 'integrations', vector: mix(unit(0), unit(1), 0.1), summary: 's' }], new Map([['i1', [
      { themeId: 'thm_a', score: 0.95, type: 'bug', productArea: 'integrations', name: 'A' },
      { themeId: 'thm_b', score: 0.97, type: 'praise', productArea: 'integrations', name: 'B (other type)' },
      { themeId: 'thm_c', score: 0.9, type: 'bug', productArea: 'integrations', name: 'C' },
    ]]]), 0.82);
    expect(a[0]).toMatchObject({ themeId: 'thm_a', newThemeKey: null, matchedName: 'A' });
  });
  it('below the threshold starts a candidate theme; later items in the run can join it', () => {
    const v = unit(0);
    const a = assignThemes([
      { key: 'i1', type: 'bug', productArea: 'integrations', vector: v, summary: 'a' },
      { key: 'i2', type: 'bug', productArea: 'integrations', vector: mix(v, unit(1), 0.05), summary: 'b' },
      { key: 'i3', type: 'praise', productArea: 'integrations', vector: v, summary: 'c' },
      { key: 'i4', type: 'bug', productArea: 'integrations', vector: unit(2), summary: 'd' },
    ], new Map([['i1', [{ themeId: 'thm_x', score: 0.5, type: 'bug', productArea: 'integrations', name: 'X' }]]]), 0.82);
    expect(a.map((x) => x.newThemeKey)).toEqual(['i1', 'i1', 'i3', 'i4']);
    expect(a.every((x) => x.themeId === null)).toBe(true);
  });
  it('is deterministic on ties (lowest theme id wins)', () => {
    const c = [{ themeId: 'thm_b', score: 0.9, type: 'bug', productArea: 'x', name: 'b' }, { themeId: 'thm_a', score: 0.9, type: 'bug', productArea: 'x', name: 'a' }];
    const a = assignThemes([{ key: 'k', type: 'bug', productArea: 'integrations', vector: unit(0), summary: '' }], new Map([['k', c]]));
    expect(a[0]!.themeId).toBe('thm_a');
  });
  it('cosine and the hash embedding fallback', () => {
    expect(cosine(unit(0), unit(0))).toBeCloseTo(1);
    expect(cosine(unit(0), unit(1))).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    const e1 = hashEmbed('offline conversions lag in google ads');
    expect(e1).toHaveLength(768);
    expect(hashEmbed('offline conversions lag in google ads')).toEqual(e1);
    expect(Math.hypot(...e1)).toBeCloseTo(1);
    expect(cosine(e1, hashEmbed('google ads offline conversions lag badly'))).toBeGreaterThan(cosine(e1, hashEmbed('dispatchers love summaries')));
    expect(themeText({ type: 'feature_request', productArea: 'call_tracking', summary: 'x' })).toBe('feature request · call tracking: x');
  });
});

const insight = (over: Partial<Insight> = {}): Insight => ({
  id: 'ins_1', workspaceId: 'ws', runId: 'run', accountId: 'acct_brightline', csmId: 'ppl_marcus', type: 'bug', summary: 'Offline conversions lag', productArea: 'integrations', severity: 'high',
  sentiment: 'negative', rationale: 'r', evidence: [{ quote: 'q', turnId: 't1', start: 0, end: 5, matchedText: 'killing us', score: 1, method: 'exact' }], confidenceModel: 0.9, groundingScore: 1,
  confidenceFinal: 0.9, gate: 'auto_route', gateReasons: [], status: 'routed', themeId: null, ownerId: 'ppl_priya', channel: 'jira', ruleId: 'rule_intg_bug', promptVersion: 'v4', model: 'm', createdAt: '2026-10-21T00:00:00Z', ...over,
});
const ctx = { account: account('acct_brightline'), owner: world.people.find((p) => p.id === 'ppl_priya')!, csm: world.people.find((p) => p.id === 'ppl_marcus')!, now: Date.parse('2026-10-21T17:00:00Z'), ids: (p: string) => `${p}_x` };
const decision = (channel: any, destination: string) => ({ ruleId: 'r', ruleName: 'n', ownerId: 'ppl_priya', channel, destination, reason: 'matched' });

describe('deliver', () => {
  it('produces channel-specific receipts and payloads, deterministically', () => {
    const jira = deliverInsight(insight(), decision('jira', 'INTG'), ctx);
    expect(jira.receipt).toMatch(/^INTG-\d{3}$/);
    expect(jira.ticketState).toBe('open');
    expect(jira.payload).toMatchObject({ project: 'INTG', issueType: 'Bug', priority: 'High', assignee: 'Priya Raman' });
    expect(deliverInsight(insight(), decision('jira', 'INTG'), ctx).receipt).toBe(jira.receipt);
    const slack = deliverInsight(insight(), decision('slack', '#pm-integrations'), ctx);
    expect(slack.receipt).toMatch(/^\d{10}\.\d{6}$/);
    expect(slack.ticketState).toBeNull();
    expect((slack.payload.blocks as unknown[]).length).toBeGreaterThan(2);
    expect(deliverInsight(insight(), decision('linear', 'Signal AI team'), ctx).receipt).toMatch(/^SAT-\d+$/);
    expect(deliverInsight(insight(), decision('email_digest', 'VP digest'), ctx).receipt).toMatch(/^digest-2026-10-21#\d+$/);
    expect(deliverInsight(insight(), decision('triage', 'Triage queue'), ctx).receipt).toMatch(/^TRI-\d{4}$/);
    expect(renderPayload('triage', insight(), decision('triage', 'Triage queue'), ctx)).toMatchObject({ queue: 'Triage queue' });
    expect(projectKey('Signal AI team', 'signal_ai')).toBe('SAI');
  });
  it('one deterministic transient failure is retried and still delivered', () => {
    let id = '';
    for (let i = 0; i < 500 && !id; i++) if (hitsTransientFailure(`ins_${i}`, 'jira')) id = `ins_${i}`;
    expect(id).not.toBe('');
    const d = deliverInsight(insight({ id }), decision('jira', 'INTG'), ctx);
    expect(d.attempts).toHaveLength(2);
    expect(d.attempts[0]!.ok).toBe(false);
    expect(d.attempts[0]!.note).toContain('503');
    expect(d.attempts[1]!.ok).toBe(true);
    expect(d.status).toBe('delivered');
    expect(hitsTransientFailure(id, 'slack')).toBe(false);
  });
  it('routed and shipped notifications', () => {
    const d = deliverInsight(insight(), decision('jira', 'INTG'), ctx);
    const n = routedNotification(insight(), d, ctx)!;
    expect(n).toMatchObject({ kind: 'routed', csmId: 'ppl_marcus' });
    expect(n.title).toBe('Your Brightline Home Services feedback reached Priya Raman');
    const s = shippedNotification(insight(), { ...d, ticketState: 'shipped' }, { ...ctx, contactFirstName: 'Dana' })!;
    expect(s.kind).toBe('shipped');
    expect(s.draftCustomerNote).toContain('Hi Dana,');
    expect(s.draftCustomerNote).toContain('has now shipped');
    expect(s.draftCustomerNote).toContain('Marcus Bell');
    expect(routedNotification(insight({ csmId: null }), d, ctx)).toBeNull();
    expect(bestQuote(insight())).toBe('killing us');
  });
});

describe('budget math', () => {
  it('allows a run only when spent + reserved + estimate fits', () => {
    expect(canRunLive({ limitUsd: 15, spentUsd: 14.97, reservedUsd: 0, liveFlag: true }, 0.02)).toEqual({ allowed: true });
    expect(canRunLive({ limitUsd: 15, spentUsd: 14.97, reservedUsd: 0.02, liveFlag: true }, 0.02)).toEqual({ allowed: false, reason: 'budget_reached' });
    expect(canRunLive({ limitUsd: 15, spentUsd: 0, reservedUsd: 0, liveFlag: false }, 0.02)).toEqual({ allowed: false, reason: 'budget_reached' });
    expect(canRunLive({ limitUsd: 15, spentUsd: 0, reservedUsd: 0, liveFlag: true, disabledByOwner: true }, 0.02)).toEqual({ allowed: false, reason: 'disabled_by_owner' });
    expect(shouldFlipOff(14.99, 15, 0.02)).toBe(true);
    expect(shouldFlipOff(14.98, 15, 0.02)).toBe(false);
    expect(remainingRuns(14, 15, 0.02)).toBe(50);
    expect(remainingRuns(16, 15, 0.02)).toBe(0);
  });
});
