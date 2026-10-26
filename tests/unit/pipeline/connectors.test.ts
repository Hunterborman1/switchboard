import { describe, expect, it } from 'vitest';
import { channelAvailable, effectiveRules, previewFlows, routeInsight, triageOwner } from '../../../src/pipeline/route.ts';
import { deliverInsight, deliveryMentions, vpCustomerSuccess } from '../../../src/pipeline/deliver.ts';
import type { Insight, Person } from '../../../src/shared/contracts.ts';
import { inferDocKind, personHandle, sourceForLibraryFile } from '../../../src/shared/platform.ts';
import { account, world } from '../../helpers/fixtures.ts';

const rules = effectiveRules(world.rules, []);
const s = (type: any, productArea: any, severity: any = 'medium', arrBand: any = '250k-1m') => ({ type, productArea, severity, arrBand });
const all = new Set(['slack', 'jira', 'linear', 'gmail']);
const without = (id: string) => new Set([...all].filter((x) => x !== id));

describe('routing through connectors', () => {
  it('a rule whose connector is connected routes as before', () => {
    const d = routeInsight(s('bug', 'integrations'), rules, world.people, { connected: all });
    expect(d).toMatchObject({ ruleId: 'rule_intg_bug', channel: 'jira', ownerId: 'ppl_priya' });
    expect(d.diverted).toBeUndefined();
  });
  it('a rule whose connector is disconnected goes to triage, saying why, and keeps the matched rule', () => {
    const d = routeInsight(s('bug', 'integrations'), rules, world.people, { connected: without('jira') });
    expect(d).toMatchObject({ ruleId: 'rule_intg_bug', channel: 'triage', ownerId: 'ppl_triage', destination: 'Triage queue' });
    expect(d.reason).toMatch(/^Jira isn't connected, so this went to triage/);
    expect(d.diverted).toEqual({ channel: 'jira', ownerId: 'ppl_priya', destination: 'INTG', why: 'not_connected' });
  });
  it('the digest needs Gmail; triage needs nothing; no connector list means all connected', () => {
    expect(routeInsight(s('praise', 'signal_ai'), rules, world.people, { connected: without('gmail') }).reason).toMatch(/^Gmail isn't connected/);
    expect(channelAvailable('triage', new Set())).toBe(true);
    expect(channelAvailable('teams', new Set(['slack']))).toBe(false);
    expect(channelAvailable('jira', null)).toBe(true);
    expect(routeInsight(s('bug', 'integrations'), rules, world.people).channel).toBe('jira');
  });
  it('a rule owned by someone removed from the directory goes to triage', () => {
    const people = world.people.map((p) => (p.id === 'ppl_priya' ? { ...p, active: false } : p));
    const d = routeInsight(s('bug', 'integrations'), rules, people, { connected: all });
    expect(d.channel).toBe('triage');
    expect(d.reason).toMatch(/^Priya Raman is no longer in the directory/);
    expect(d.diverted?.why).toBe('owner_inactive');
  });
  it('the triage owner skips inactive people', () => {
    const support: Person = { id: 'ppl_support', name: 'Derek Shaw', role: 'support_escalation', title: 'Support Escalations Lead', productArea: null, slackHandle: '@derek', email: 'derek@invoca.example', initials: 'DS' };
    const people = [...world.people, support];
    expect(triageOwner(people)).toBe('ppl_triage');
    expect(triageOwner(people.map((p) => (p.id === 'ppl_triage' ? { ...p, active: false } : p)))).toBe('ppl_support');
  });
  it('the routing preview reflects disconnected connectors', () => {
    const subjects = [s('bug', 'integrations'), s('bug', 'integrations')];
    expect(previewFlows(subjects, rules, world.people, { connected: all })[0]!.ownerId).toBe('ppl_priya');
    expect(previewFlows(subjects, rules, world.people, { connected: without('jira') })[0]!.ownerId).toBe('ppl_triage');
  });
});

const vpcs: Person = { id: 'ppl_vpcs', name: 'Renee Adams', role: 'csm', title: 'VP, Customer Success', productArea: null, slackHandle: '@renee.adams', email: 'renee.adams@invoca.example', initials: 'RA' };
const people = [...world.people, vpcs];
const owner = world.people.find((p) => p.id === 'ppl_priya')!;
const csm = world.people.find((p) => p.id === 'ppl_marcus')!;
const insight = (over: Partial<Insight> = {}): Insight => ({
  id: 'ins_1', workspaceId: 'ws', runId: 'run', accountId: 'acct_brightline', csmId: 'ppl_marcus', type: 'bug', summary: 'Offline conversions lag', productArea: 'integrations', severity: 'high',
  sentiment: 'negative', rationale: 'r', evidence: [{ quote: 'q', turnId: 't1', start: 0, end: 5, matchedText: 'killing us', score: 1, method: 'exact' }], confidenceModel: 0.9, groundingScore: 1,
  confidenceFinal: 0.9, gate: 'auto_route', gateReasons: [], status: 'routed', themeId: null, ownerId: 'ppl_priya', channel: 'jira', ruleId: 'r', promptVersion: 'v4', model: 'm', createdAt: '2026-10-21T00:00:00Z', ...over,
});
const ctx = { account: account('acct_brightline'), owner, csm, now: Date.parse('2026-10-21T17:00:00Z'), ids: (p: string) => `${p}_x`, people, connectorAccount: 'invoca.example.tool' };
const decision = (channel: any, destination: string) => ({ ruleId: 'r', ruleName: 'n', ownerId: 'ppl_priya', channel, destination, reason: 'matched' });

describe('delivery through connectors', () => {
  it('new channels have payloads and receipts', () => {
    const teams = deliverInsight(insight(), decision('teams', 'Product › Feedback'), ctx);
    expect(teams.receipt).toMatch(/^\d{16}$/);
    expect(teams.payload).toMatchObject({ channel: 'Product › Feedback' });
    expect((teams.payload.blocks as unknown[]).length).toBeGreaterThan(2);
    const sf = deliverInsight(insight(), decision('salesforce', 'Account team'), ctx);
    expect(sf.receipt).toMatch(/^00T5f00000[0-9A-Za-z]{5}$/);
    expect(sf.payload).toMatchObject({ object: 'Account', task: { owner: 'Priya Raman', priority: 'High', status: 'Not Started' } });
    const email = deliverInsight(insight(), decision('email', 'Owner'), ctx);
    expect(email.receipt).toMatch(/^<sl\.[0-9a-f]{8}\.[0-9a-z]+@invoca\.example>$/);
    expect(email.payload).toMatchObject({ to: owner.email, cc: [csm.email] });
    const drive = deliverInsight(insight(), decision('google_drive', 'Customer Success / Signals'), ctx);
    expect(drive.receipt).toMatch(/^VOC-INTG#r\d+$/);
    expect(drive.payload).toMatchObject({ doc: 'Voice of customer · Integrations', heading: '2026-10-21' });
    // Every payload keeps the flat preview fields.
    for (const d of [teams, sf, email, drive]) expect(d.payload).toMatchObject({ type: 'bug', productArea: 'integrations', account: 'Brightline Home Services', csm: 'Marcus Bell' });
  });
  it('records the connected account (none for triage)', () => {
    expect(deliverInsight(insight(), decision('slack', '#x'), ctx).connectorAccount).toBe('invoca.example.tool');
    expect(deliverInsight(insight(), decision('triage', 'Triage queue'), ctx).connectorAccount).toBeNull();
  });
  it('tags the owner and the CSM by their handle in that tool', () => {
    const slack = deliverInsight(insight(), decision('slack', '#x'), ctx);
    expect(slack.mentions).toEqual([{ personId: 'ppl_priya', handle: '@priya', role: 'owner' }, { personId: 'ppl_marcus', handle: '@marcus.bell', role: 'csm' }]);
    expect(JSON.stringify(slack.payload.blocks)).toContain('cc @priya @marcus.bell');
    expect(deliverInsight(insight(), decision('jira', 'INTG'), ctx).mentions!.map((m) => m.handle)).toEqual(['Priya Raman', 'Marcus Bell']);
    expect(deliverInsight(insight(), decision('email_digest', 'VP digest'), ctx).mentions!.map((m) => m.handle)).toEqual([owner.email, csm.email]);
    // A tool identity wins over the fallback.
    const withJira = { ...ctx, owner: { ...owner, identities: { jira: 'praman' } } };
    expect(deliverInsight(insight(), decision('jira', 'INTG'), withJira).mentions![0]!.handle).toBe('praman');
  });
  it('churn risk and pricing on accounts over $250k also tag the VP of Customer Success', () => {
    expect(vpCustomerSuccess(people)?.id).toBe('ppl_vpcs');
    const churn = deliveryMentions({ type: 'churn_risk' }, 'slack', ctx);
    expect(churn.find((m) => m.role === 'watcher')).toEqual({ personId: 'ppl_vpcs', handle: '@renee.adams', role: 'watcher' });
    expect(deliveryMentions({ type: 'pricing_objection' }, 'slack', ctx).some((m) => m.role === 'watcher')).toBe(true);
    expect(deliveryMentions({ type: 'bug' }, 'slack', ctx).some((m) => m.role === 'watcher')).toBe(false);
    expect(deliveryMentions({ type: 'churn_risk' }, 'slack', { ...ctx, account: account('acct_sunpeak') }).some((m) => m.role === 'watcher')).toBe(false);
  });
  it('people removed from the directory are not tagged, and nobody is tagged twice', () => {
    const gone = deliveryMentions({ type: 'bug' }, 'slack', { ...ctx, csm: { ...csm, active: false } });
    expect(gone.map((m) => m.role)).toEqual(['owner']);
    expect(deliveryMentions({ type: 'bug' }, 'slack', { ...ctx, csm: owner }).length).toBe(1);
  });
});

describe('platform helpers', () => {
  it('personHandle falls back by tool category', () => {
    expect(personHandle(owner, 'slack')).toBe('@priya');
    expect(personHandle(owner, 'teams')).toBe('@priya');
    expect(personHandle(owner, 'gmail')).toBe(owner.email);
    expect(personHandle(owner, 'google_drive')).toBe(owner.email);
    expect(personHandle(owner, 'salesforce')).toBe('Priya Raman');
    expect(personHandle(owner, null)).toBe('Priya Raman');
    expect(personHandle({ ...owner, identities: { teams: 'priya@invoca.onmicrosoft.com' } }, 'teams')).toBe('priya@invoca.onmicrosoft.com');
  });
  it('library files map to a source deterministically', () => {
    expect(sourceForLibraryFile('GMT20261009-183011_PrairieLink-QBR.transcript.vtt', 'vtt')).toBe('zoom');
    expect(sourceForLibraryFile('2026-10-08_KeystoneMutual_QBR.vtt', 'vtt')).toBe('gong');
    expect(sourceForLibraryFile('RE_ pricing.eml', 'eml')).toBe('gmail');
    expect(sourceForLibraryFile('slack-export_keystone.txt', 'chat')).toBe('slack');
    expect(sourceForLibraryFile('notes.md', 'md')).toBe('google_drive');
    expect(sourceForLibraryFile('call.txt', 'txt')).toBe('upload');
  });
  it('doc kinds are inferred for runs that predate triage', () => {
    expect(inferDocKind('eml', 'renewal')).toBe('email_thread');
    expect(inferDocKind('chat', 'other')).toBe('chat_thread');
    expect(inferDocKind('md', 'qbr')).toBe('meeting_notes');
    expect(inferDocKind('txt', 'notes')).toBe('meeting_notes');
    expect(inferDocKind('vtt', 'qbr')).toBe('call_transcript');
    expect(inferDocKind('doc', null)).toBe('document');
  });
});
