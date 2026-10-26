import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newWs, seedFixtures, startHarness, waitForRun, type Harness } from './harness.ts';
import { SEED_CONNECTED } from '../../src/shared/platform.ts';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
  await seedFixtures(h.env.DB);
}, 180_000);
afterAll(async () => {
  await h?.close();
});

const uuid = () => crypto.randomUUID();
let n = 0;
/** Pasted Brightline notes (unique each call, so dedupe never returns an earlier run). */
const notes = (...lines: string[]) => `Notes from the Brightline Home Services check-in #${++n} (${uuid().slice(0, 8)}).\n${lines.join('\n')}\nCSM: thanks, logged.`;
const BUG = 'Customer: honestly the offline conversions thing is killing us, they land in Google Ads days late.';

async function run(ws: string, text: string, extra: Record<string, unknown> = {}) {
  const r = await h.call('/runs', { method: 'POST', ws, json: { text, filename: 'notes.txt', ...extra } });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return waitForRun(h, r.json.data.runId, ws);
}

describe('session and actor', () => {
  it('the session carries the decision model and who the viewer acts as', async () => {
    const ws = newWs();
    const s = (await h.call('/session', { ws })).json.data;
    expect(s.models).toEqual({ primary: 'deepseek/deepseek-v4.1-flash', secondary: 'anthropic/claude-haiku-5.5', decision: 'z-ai/glm-5.3-flash' });
    // The fixture directory has no ppl_elena: the first active admin (product leadership).
    expect(s.actor).toMatchObject({ personId: 'ppl_renee', name: 'Renee Laurent', isAdmin: true });
    expect((await h.call('/me', { ws })).json.data).toEqual(s.actor);
  });

  it('PUT /me switches the actor; reviews record that person; unknown and inactive people are refused', async () => {
    const ws = newWs();
    const me = await h.call('/me', { method: 'PUT', ws, json: { personId: 'ppl_omar' } });
    expect(me.status).toBe(200);
    expect(me.json.data).toEqual({ personId: 'ppl_omar', name: 'Omar Haddad', title: 'PM, Signal AI', initials: 'OH', isAdmin: false });
    expect((await h.call('/session', { ws })).json.data.actor.personId).toBe('ppl_omar');
    expect((await h.call('/me', { method: 'PUT', ws, json: { personId: 'ppl_nobody' } })).status).toBe(404);
    expect((await h.call('/me', { method: 'PUT', ws, json: {} })).status).toBe(400);
    // Churn risk is always reviewed: approve it as Omar.
    const d = await run(ws, notes("Customer: if this isn't fixed we won't renew in January."));
    const pending = d.insights.find((i: any) => i.status === 'pending_review');
    expect(pending).toBeTruthy();
    const r = await h.call(`/review/${pending.id}`, { method: 'POST', ws, json: { idempotencyKey: uuid(), action: 'approve' } });
    expect(r.status).toBe(200);
    expect(r.json.data.insight.gateReasons.at(-1)).toBe('approved by Omar Haddad');
    const detail = (await h.call(`/insights/${pending.id}`, { ws })).json.data;
    expect(detail.reviews[0].reviewer).toBe('Omar Haddad');
  });
});

describe('connections', () => {
  it('lists every catalog connector with the seed defaults', async () => {
    const ws = newWs();
    const list = (await h.call('/connections', { ws })).json.data;
    expect(list).toHaveLength(12);
    const by = Object.fromEntries(list.map((c: any) => [c.id, c]));
    for (const id of ['slack', 'jira', 'linear', 'gmail', 'gong', 'zoom']) expect(by[id]).toMatchObject({ status: 'connected', account: expect.any(String), connectedAt: expect.any(String) });
    expect(by.jira.account).toBe('invoca.atlassian.net');
    expect(by.teams).toMatchObject({ status: 'disconnected', account: null, activityCount: 0, lastActivityAt: null });
    expect((await h.call('/connections/nope', { ws })).status).toBe(404);
  });

  it('connect, configure, test and disconnect, recorded against the actor', async () => {
    const ws = newWs();
    const bad = await h.call('/connections/teams', { method: 'PUT', ws, json: { action: 'explode' } });
    expect(bad.status).toBe(400);
    expect((await h.call('/connections/teams', { method: 'PUT', ws, json: { action: 'configure', config: { defaultChannel: 'x' } } })).status).toBe(409);
    const notYet = (await h.call('/connections/teams/test', { method: 'POST', ws, json: {} })).json.data;
    expect(notYet).toMatchObject({ ok: false, receipt: null });
    const on = await h.call('/connections/teams', { method: 'PUT', ws, json: { action: 'connect', config: { defaultChannel: 'Product › Feedback', bogus: 'dropped' } } });
    expect(on.status).toBe(200);
    expect(on.json.data).toMatchObject({ id: 'teams', status: 'connected', account: 'Invoca (Microsoft 365)', config: { defaultChannel: 'Product › Feedback' }, connectedBy: 'ppl_renee' });
    expect(on.json.data.config.bogus).toBeUndefined();
    const cfg = await h.call('/connections/jira', { method: 'PUT', ws, json: { action: 'configure', config: { defaultProject: 'SIG' } } });
    expect(cfg.json.data.config).toEqual({ defaultProject: 'SIG' });
    const test = (await h.call('/connections/jira/test', { method: 'POST', ws, json: {} })).json.data;
    expect(test).toMatchObject({ ok: true, receipt: expect.stringMatching(/^SIG-\d+$/) });
    expect(test.message).toMatch(/^Sent a test issue to SIG/);
    const detail = (await h.call('/connections/jira', { ws })).json.data;
    expect(detail.connection.id).toBe('jira');
    expect(detail.activity[0]).toMatchObject({ connectorId: 'jira', status: 'test', direction: 'out' });
    const off = await h.call('/connections/teams', { method: 'PUT', ws, json: { action: 'disconnect' } });
    expect(off.json.data).toMatchObject({ status: 'disconnected', account: null, config: { defaultChannel: 'Product › Feedback' } });
    // The write guard applies to these routes too.
    expect((await h.call('/connections/teams', { method: 'PUT', ws, site: false, json: { action: 'connect' } })).status).toBe(403);
    const audit = await h.env.DB.prepare("SELECT actor, action FROM audit_log WHERE workspace_id = ? AND target = 'teams' ORDER BY created_at").bind(ws).all<{ actor: string; action: string }>();
    expect(audit.results.map((r) => r.action)).toEqual(['connection.connect', 'connection.disconnect']);
    expect(audit.results[0]!.actor).toMatch(/^Renee Laurent \(viewer:/);
  });

  it('a rule whose connector is disconnected routes to triage with the reason; reconnecting restores it', async () => {
    const ws = newWs();
    expect((await h.call('/connections/jira', { method: 'PUT', ws, json: { action: 'disconnect' } })).status).toBe(200);
    const off = await run(ws, notes(BUG));
    const bug = off.insights.find((i: any) => i.type === 'bug');
    expect(bug).toMatchObject({ channel: 'triage', ownerId: 'ppl_triage', ruleId: 'rule_intg_bug', gate: 'auto_route' });
    const route = off.steps.find((s: any) => s.key === 'route');
    expect(route.summary).toMatch(/to triage \(Jira not connected\)/);
    expect(route.detail.decisions.find((x: any) => x.insightId === bug.id).reason).toMatch(/^Jira isn't connected, so this went to triage/);
    expect(off.deliveries.find((d: any) => d.insightId === bug.id)).toMatchObject({ channel: 'triage', connectorAccount: null });
    // The routing preview agrees.
    const rules = (await h.call('/routing/rules', { ws })).json.data;
    const preview = (await h.call('/routing/preview', { method: 'POST', ws, json: rules })).json.data;
    expect(preview.flows.find((f: any) => f.type === 'bug' && f.area === 'integrations').ownerId).toBe('ppl_triage');
    // Reconnect: back to Jira, through the connected account, and it shows in Jira's activity.
    await h.call('/connections/jira', { method: 'PUT', ws, json: { action: 'connect' } });
    const on = await run(ws, notes(BUG));
    const dl = on.deliveries.find((d: any) => d.insightId === on.insights.find((i: any) => i.type === 'bug').id);
    expect(dl).toMatchObject({ channel: 'jira', destination: 'INTG', connectorAccount: 'invoca.atlassian.net' });
    expect(dl.mentions).toEqual([{ personId: 'ppl_priya', handle: 'Priya Raman', role: 'owner' }, { personId: 'ppl_marcus', handle: 'Marcus Bell', role: 'csm' }]);
    const activity = (await h.call('/connections/jira', { ws })).json.data;
    expect(activity.connection.activityCount).toBeGreaterThan(0);
    expect(activity.activity.some((a: any) => a.insightId === dl.insightId && a.direction === 'out' && a.runId === on.run.id)).toBe(true);
  });

  it('runs record their source and original format; a disconnected source is refused', async () => {
    const ws = newWs();
    const d = await run(ws, `Quarterly Business Review\n\n${notes(BUG)}`, { formatHint: 'doc', sourceFormat: 'pdf', source: 'upload', filename: 'qbr.pdf' });
    expect(d.run).toMatchObject({ source: 'upload', sourceFormat: 'pdf', docKind: 'call_transcript' });
    expect(d.steps.find((s: any) => s.key === 'normalize').detail.format).toBe('doc');
    expect((await h.call('/runs', { method: 'POST', ws, json: { text: notes(BUG), source: 'zendesk' } })).json.error.code).toBe('source_not_connected');
    expect((await h.call('/runs', { method: 'POST', ws, json: { text: notes(BUG), source: 'carrier-pigeon' } })).status).toBe(400);
    const gong = await run(ws, notes(BUG), { source: 'gong' });
    expect(gong.run.source).toBe('gong');
    const imports = (await h.call('/connections/gong', { ws })).json.data.activity;
    expect(imports.some((a: any) => a.runId === gong.run.id && a.direction === 'in')).toBe(true);
    // Library files keep their source mapping; seeded-history rows derive it.
    const lib = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_injection', mode: 'replay' } });
    expect((await h.call(`/runs/${lib.json.data.runId}`, { ws })).json.data.run.source).toBe('gmail');
  });
});

describe('people', () => {
  it('lists the directory with identities; adds, edits and deactivates people in this workspace only', async () => {
    const ws = newWs();
    const other = newWs();
    const people = (await h.call('/people', { ws })).json.data;
    expect(people.find((p: any) => p.id === 'ppl_priya')).toMatchObject({ active: true, custom: false, identities: { email: 'priya@invoca.example', slack: '@priya' } });
    expect((await h.call('/people', { method: 'POST', ws, json: { name: 'J', title: 'x', role: 'pm', email: 'nope' } })).status).toBe(400);
    expect((await h.call('/people', { method: 'POST', ws, json: { name: 'Jo Doe', title: 'PM', role: 'pm', email: 'priya@invoca.example' } })).json.error.code).toBe('duplicate_person');
    const added = await h.call('/people', { method: 'POST', ws, json: { name: 'Jo Doe', title: 'PM, Integrations', role: 'pm', productArea: 'integrations', email: 'jo.doe@invoca.example', identities: { jira: 'jdoe' } } });
    expect(added.status).toBe(201);
    const jo = added.json.data;
    expect(jo).toMatchObject({ name: 'Jo Doe', initials: 'JD', custom: true, active: true, slackHandle: '@jo.doe', identities: { jira: 'jdoe', email: 'jo.doe@invoca.example' } });
    const edit = await h.call(`/people/${jo.id}`, { method: 'PUT', ws, json: { title: 'Senior PM, Integrations', identities: { slack: 'jodoe' } } });
    expect(edit.json.data).toMatchObject({ title: 'Senior PM, Integrations', slackHandle: '@jodoe', identities: { slack: '@jodoe', jira: 'jdoe' } });
    expect((await h.call('/people/ppl_missing', { method: 'PUT', ws, json: { title: 'x y' } })).status).toBe(404);
    expect((await h.call('/world', { ws })).json.data.people.some((p: any) => p.id === jo.id)).toBe(true);
    expect((await h.call('/people', { ws: other })).json.data.some((p: any) => p.id === jo.id)).toBe(false);

    // Make Jo the owner of the integrations-bug rule: Jo is tagged by their Jira identity.
    const rule = (await h.call('/routing/rules', { ws })).json.data.find((r: any) => r.id === 'rule_intg_bug');
    expect((await h.call('/routing/rules/rule_intg_bug', { method: 'PUT', ws, json: { ...rule, ownerId: jo.id } })).status).toBe(200);
    const d = await run(ws, notes(BUG));
    const dl = d.deliveries.find((x: any) => x.channel === 'jira');
    expect(dl.ownerId).toBe(jo.id);
    expect(dl.mentions[0]).toEqual({ personId: jo.id, handle: 'jdoe', role: 'owner' });
    expect(dl.payload.assignee).toBe('Jo Doe');

    // Deactivate: kept for history, rules move to the triage owner, routing skips them.
    const del = await h.call(`/people/${jo.id}`, { method: 'DELETE', ws, json: {} });
    expect(del.status).toBe(200);
    expect(del.json.data.person).toMatchObject({ id: jo.id, active: false });
    expect(del.json.data.reassignedRules).toEqual(['rule_intg_bug']);
    expect((await h.call('/routing/rules', { ws })).json.data.find((r: any) => r.id === 'rule_intg_bug').ownerId).toBe('ppl_triage');
    expect((await h.call('/people', { ws })).json.data.find((p: any) => p.id === jo.id).active).toBe(false);
    const again = await h.call(`/people/${jo.id}`, { method: 'DELETE', ws, json: {} });
    expect(again.json.data.reassignedRules).toEqual([]);
    // Reactivating brings the person back (rules stay where they were moved).
    expect((await h.call(`/people/${jo.id}`, { method: 'PUT', ws, json: { active: true } })).json.data.active).toBe(true);
    // The last person who can own triage cannot be removed.
    expect((await h.call('/people/ppl_triage', { method: 'DELETE', ws, json: {} })).json.error.code).toBe('last_triage_owner');
  });
});

describe('analyses and overview', () => {
  it('the catalog counts runs for the built analysis only', async () => {
    const ws = newWs();
    const list = (await h.call('/analyses', { ws })).json.data;
    expect(list.map((a: any) => a.id)).toEqual(['product_feedback', 'follow_ups', 'deal_risk', 'support_escalation', 'compliance', 'coaching']);
    expect(typeof list[0].runs).toBe('number');
    expect(list.slice(1).every((a: any) => a.availability === 'not_built' && a.runs === undefined)).toBe(true);
  });

  it('the overview summarises what came in and what went out', async () => {
    const ws = newWs();
    await run(ws, notes(BUG), { source: 'gong' });
    const o = (await h.call('/overview?days=7', { ws })).json.data;
    expect(o.window.days).toBe(7);
    expect(o.conversations).toBeGreaterThanOrEqual(1);
    expect(o.bySource.find((x: any) => x.source === 'gong').count).toBeGreaterThanOrEqual(1);
    expect(o.byKind.length).toBeGreaterThan(0);
    expect(o.analysesRun[0]).toMatchObject({ id: 'product_feedback' });
    expect(o.deliveries).toBeGreaterThanOrEqual(1);
    expect(o.byConnector.find((x: any) => x.connectorId === 'jira').count).toBeGreaterThanOrEqual(1);
    expect(o.peopleTagged).toBeGreaterThanOrEqual(2);
    expect(o.connectedCount).toBe(SEED_CONNECTED.length);
    expect(o.medianMinutesToOwner).not.toBeNull();
    expect((await h.call('/overview?days=0', { ws })).status).toBe(400);
  });
});

describe('decision models in a live run', () => {
  it('the second opinion promotes a borderline item it agrees with and holds one it disputes', async () => {
    const ws = newWs();
    const d = await run(ws, notes(
      'Customer: Jeff keeps forwarding CallRail emails about same day sync SECOND_OPINION_AGREE.',
      'Customer: the offline conversions thing is killing us SECOND_OPINION_DISAGREE.',
    ));
    const comp = d.insights.find((i: any) => i.type === 'competitor_mention');
    expect(comp).toMatchObject({ gate: 'auto_route', secondOpinion: { agree: true, effect: 'promoted', model: 'z-ai/glm-5.3-flash' } });
    expect(comp.gateReasons).toContain('Second opinion agreed (0.93)');
    const bug = d.insights.find((i: any) => i.type === 'bug');
    expect(bug).toMatchObject({ gate: 'review', status: 'pending_review', secondOpinion: { agree: false, effect: 'demoted' } });
    expect(bug.gateReasons.at(-1)).toBe('Second opinion disagreed: The quote does not say this');
    expect(d.deliveries.map((x: any) => x.insightId)).toEqual([comp.id]);
    const score = d.steps.find((s: any) => s.key === 'score');
    expect(score.summary).toMatch(/second opinion promoted 1, held 1 for review/);
    expect(score.model).toBe('z-ai/glm-5.3-flash');
  });

  it('a decision-model outage falls back to the main model for triage; the run is unaffected', async () => {
    const ws = newWs();
    const d = await run(ws, notes(`${BUG} DECISION_DOWN`));
    const screen = d.steps.find((s: any) => s.key === 'screen');
    expect(screen.model).toBe('deepseek/deepseek-v4.1-flash');
    expect(screen.detail).toMatchObject({ fellBack: true, fallback: false, actionable: true });
    expect(screen.status).toBe('passed');
    expect(d.insights.length).toBeGreaterThan(0);
    const calls = await h.env.DB.prepare("SELECT model, ok, fallback FROM ai_calls WHERE run_id = ? AND purpose = 'screen' ORDER BY created_at").bind(d.run.id).all<{ model: string; ok: number; fallback: number }>();
    expect(calls.results).toEqual([{ model: 'z-ai/glm-5.3-flash', ok: 0, fallback: 0 }, { model: 'deepseek/deepseek-v4.1-flash', ok: 1, fallback: 1 }]);
    expect(h.mock.requests.some((q) => q.user.includes('DECISION_DOWN') && q.model.startsWith('anthropic/') && q.schema === 'screen')).toBe(false);
  });
});

describe('workspace reset', () => {
  it('clears connections, people, prefs and test activity', async () => {
    const ws = newWs();
    await h.call('/connections/jira', { method: 'PUT', ws, json: { action: 'disconnect' } });
    await h.call('/connections/slack/test', { method: 'POST', ws, json: {} });
    await h.call('/people', { method: 'POST', ws, json: { name: 'Temp Person', title: 'PM', role: 'pm', email: 'temp@invoca.example' } });
    await h.call('/me', { method: 'PUT', ws, json: { personId: 'ppl_omar' } });
    expect((await h.call('/workspace/reset', { method: 'POST', ws, json: {} })).status).toBe(200);
    expect((await h.call('/connections', { ws })).json.data.find((c: any) => c.id === 'jira').status).toBe('connected');
    expect((await h.call('/people', { ws })).json.data.some((p: any) => p.name === 'Temp Person')).toBe(false);
    expect((await h.call('/me', { ws })).json.data.personId).toBe('ppl_renee');
    for (const t of ['connections', 'connection_activity', 'workspace_people', 'workspace_prefs']) {
      expect((await h.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE workspace_id = ?`).bind(ws).first<{ n: number }>())!.n).toBe(0);
    }
  });
});
