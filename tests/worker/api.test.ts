import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newWs, seedFixtures, startHarness, waitForRun, type Harness } from './harness.ts';

let h: Harness;

beforeAll(async () => {
  h = await startHarness({ vars: { LIVE_FALLBACK_MS: '7000' } });
  await seedFixtures(h.env.DB);
}, 180_000);
afterAll(async () => {
  await h?.close();
});

const uuid = () => crypto.randomUUID();

describe('session & workspace', () => {
  it('sets an sl_ws cookie on first call and returns the session', async () => {
    const r = await h.call('/session', { ws: null });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/sl_ws=ws_[a-f0-9]{16}; Path=\/repo\/invoca; HttpOnly; Secure; SameSite=Lax/);
    expect(r.headers.get('x-trace-id')).toMatch(/^[a-f0-9]{32}$/);
    expect(r.json.data.isOwner).toBe(false);
    expect(r.json.data.budget.limitUsd).toBe(15);
    expect(r.json.data.models.primary).toBe('deepseek/deepseek-v4.1-flash');
    expect(typeof r.json.dataAsOf).toBe('string');
  });

  it('keeps a valid workspace cookie and ignores a malformed one', async () => {
    const ws = newWs();
    const ok = await h.call('/session', { ws });
    expect(ok.json.data.workspaceId).toBe(ws);
    expect(ok.headers.get('set-cookie')).toBeNull();
    const bad = await h.call('/session', { ws: 'seed' });
    expect(bad.json.data.workspaceId).not.toBe('seed');
  });

  it('owner cookie marks the session as owner', async () => {
    const r = await h.call('/session', { auth: 'owner', ws: newWs() });
    expect(r.status).toBe(200);
    expect(r.json.data.isOwner).toBe(true);
  });
});

describe('world & library', () => {
  it('lists featured files and serves content', async () => {
    const ws = newWs();
    const lib = await h.call('/library', { ws });
    expect(lib.status).toBe(200);
    expect(lib.json.data.find((f: any) => f.id === 'file_c1042').recommended).toBe(true);
    const one = await h.call('/library/file_c1042', { ws });
    expect(one.json.data.content).toContain('WEBVTT');
    expect(one.json.data.file.sha256).toBeUndefined();
    expect((await h.call('/library/nope', { ws })).status).toBe(404);
    const world = await h.call('/world', { ws });
    expect(world.json.data.accounts.length).toBeGreaterThan(0);
    expect(world.json.data.people.length).toBeGreaterThan(0);
  });
});

describe('full live run → review → delivery → ticket shipped → notification', () => {
  const ws = newWs();
  let runId = '';

  it('creates a live run and the Workflow writes all 10 steps', async () => {
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_c1042' } });
    expect(r.status).toBe(201);
    expect(r.json.data.mode).toBe('live');
    expect(r.json.data.duplicate).toBe(false);
    runId = r.json.data.runId;
    const d = await waitForRun(h, runId, ws);
    expect(d.run.mode).toBe('live');
    expect(['awaiting_review', 'completed']).toContain(d.run.status);
    expect(d.steps.map((s: any) => s.key)).toEqual(['ingest', 'normalize', 'redact', 'screen', 'extract', 'ground', 'score', 'theme', 'route', 'deliver']);
    expect(d.steps.every((s: any) => s.status !== 'failed' && s.finishedAt)).toBe(true);
    expect(d.steps.find((s: any) => s.key === 'extract').model).toBe('deepseek/deepseek-v4.1-flash');
    expect(d.turns.length).toBeGreaterThan(3);
    expect(d.insights.length).toBeGreaterThanOrEqual(4);
    expect(d.screen.actionable).toBe(true);
    // Redacted text only, masked previews only.
    const blob = JSON.stringify(d);
    expect(blob).not.toContain('704-555-0142');
    expect(blob).not.toContain('dana.whitfield@brightline.example');
    expect(blob).not.toContain('Whitfield');
    expect(d.redactions.every((x: any) => x.preview.includes('•'))).toBe(true);
    // The model only ever saw redacted text.
    const sent = h.mock.requests.filter((q) => q.user.includes('brightline') || q.user.includes('Brightline')).map((q) => q.user).join('\n');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent).not.toContain('704-555-0142');
    // Provider routing on every call, no temperature for anthropic.
    for (const q of h.mock.requests) expect(q.body.provider).toMatchObject({ data_collection: 'deny', require_parameters: true, sort: 'throughput' });
    // Every model call is in the ledger.
    const ledger = await h.env.DB.prepare('SELECT COUNT(*) AS n, SUM(cost_usd) AS c FROM ai_calls WHERE run_id = ?').bind(runId).first<{ n: number; c: number }>();
    expect(ledger!.n).toBeGreaterThanOrEqual(2);
    expect(ledger!.c).toBeGreaterThan(0);
    expect(d.run.costUsd).toBeGreaterThan(0);
  });

  it('auto-routed insights are delivered with receipts; review items wait', async () => {
    const d = (await h.call(`/runs/${runId}`, { ws })).json.data;
    const auto = d.insights.filter((i: any) => i.gate === 'auto_route');
    expect(d.deliveries.length).toBe(auto.length);
    for (const dl of d.deliveries) {
      expect(dl.status).toBe('delivered');
      expect(dl.receipt).toBeTruthy();
      expect(dl.attempts.at(-1).ok).toBe(true);
    }
    const review = await h.call('/review', { ws });
    expect(review.json.data.some((i: any) => i.runId === runId)).toBe(true);
    expect(review.json.data.every((i: any) => i.status === 'pending_review')).toBe(true);
  });

  it('approve routes + delivers synchronously, idempotently, and completes the run', async () => {
    const pending = (await h.call('/review', { ws })).json.data.filter((i: any) => i.runId === runId);
    expect(pending.length).toBeGreaterThan(0);
    const target = pending[0];
    const key = uuid();
    const r = await h.call(`/review/${target.id}`, { method: 'POST', ws, json: { idempotencyKey: key, action: 'approve', dwellMs: 30_000 } });
    expect(r.status).toBe(200);
    expect(r.json.data.insight.status).toBe('routed');
    expect(r.json.data.delivery.status).toBe('delivered');
    const again = await h.call(`/review/${target.id}`, { method: 'POST', ws, json: { idempotencyKey: key, action: 'approve' } });
    expect(again.status).toBe(200);
    expect(again.json.data.delivery.id).toBe(r.json.data.delivery.id);
    const conflict = await h.call(`/review/${target.id}`, { method: 'POST', ws, json: { idempotencyKey: uuid(), action: 'approve' } });
    expect(conflict.status).toBe(409);
    expect(conflict.json.error.code).toBe('not_pending');
    const detail = await h.call(`/insights/${target.id}`, { ws });
    expect(detail.json.data.reviews.length).toBe(1);
    expect(detail.json.data.reviews[0].before.status).toBe('pending_review');
    expect(detail.json.data.reviews[0].after.status).toBe('routed');
    // Resolve the rest: one edit, one reject.
    const rest = pending.slice(1);
    for (const [i, ins] of rest.entries()) {
      const res = await h.call(`/review/${ins.id}`, { method: 'POST', ws, json: i % 2 === 0 ? { idempotencyKey: uuid(), action: 'edit', edits: { severity: 'critical', summary: 'Edited by a reviewer for the test' } } : { idempotencyKey: uuid(), action: 'reject', reason: 'duplicate' } });
      expect(res.status).toBe(200);
      if (i % 2 === 0) expect(res.json.data.insight.summary).toBe('Edited by a reviewer for the test');
      else expect(res.json.data.insight.status).toBe('rejected');
    }
    const run = (await h.call(`/runs/${runId}`, { ws })).json.data.run;
    expect(run.status).toBe('completed');
    expect(run.reviewCount).toBe(0);
  });

  it('shipping a ticket notifies the CSM with a drafted customer note', async () => {
    const deliveries = (await h.call('/deliveries', { ws })).json.data.filter((d: any) => d.ticketState !== null && d.workspaceId === ws);
    expect(deliveries.length).toBeGreaterThan(0);
    const dl = deliveries[0];
    const prog = await h.call(`/deliveries/${dl.id}/ticket`, { method: 'POST', ws, json: { state: 'in_progress' } });
    expect(prog.json.data.notification.kind).toBe('acknowledged');
    const r = await h.call(`/deliveries/${dl.id}/ticket`, { method: 'POST', ws, json: { state: 'shipped' } });
    expect(r.status).toBe(200);
    expect(r.json.data.delivery.ticketState).toBe('shipped');
    expect(r.json.data.notification.kind).toBe('shipped');
    expect(r.json.data.notification.draftCustomerNote).toContain('has now shipped');
    const notes = await h.call('/notifications', { ws });
    expect(notes.json.data.some((n: any) => n.kind === 'shipped' && n.workspaceId === ws)).toBe(true);
    const nonTicket = (await h.call('/deliveries', { ws })).json.data.find((d: any) => d.ticketState === null && d.workspaceId === ws);
    if (nonTicket) expect((await h.call(`/deliveries/${nonTicket.id}/ticket`, { method: 'POST', ws, json: { state: 'shipped' } })).status).toBe(409);
    expect((await h.call(`/deliveries/${dl.id}/ticket`, { method: 'POST', ws, json: { state: 'bogus' } })).status).toBe(400);
  });

  it('themes aggregate the run and reflect the shipped ticket', async () => {
    const themes = (await h.call('/themes', { ws })).json.data;
    expect(themes.length).toBeGreaterThan(0);
    expect(themes.some((t: any) => t.status === 'shipped')).toBe(true);
    const t = themes[0];
    expect(t.weekly.length).toBeGreaterThan(0);
    const one = await h.call(`/themes/${t.id}`, { ws });
    expect(one.json.data.insights.length).toBe(t.insightCount);
    expect((await h.call('/themes/thm_missing', { ws })).status).toBe(404);
  });

  it('a duplicate upload returns the existing run', async () => {
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_c1042' } });
    expect(r.status).toBe(200);
    expect(r.json.data.duplicate).toBe(true);
    expect(r.json.data.runId).toBe(runId);
  });

  it('insights filter by type, status and search', async () => {
    const all = (await h.call(`/insights?runId=${runId}`, { ws })).json.data;
    expect(all.length).toBeGreaterThan(0);
    const type = all[0].type;
    const byType = (await h.call(`/insights?type=${type}`, { ws })).json.data;
    expect(byType.every((i: any) => i.type === type)).toBe(true);
    const routed = (await h.call('/insights?status=routed', { ws })).json.data;
    expect(routed.every((i: any) => i.status === 'routed')).toBe(true);
    const q = (await h.call('/insights?q=offline', { ws })).json.data;
    expect(q.length).toBeGreaterThan(0);
    expect((await h.call('/insights?limit=0', { ws })).status).toBe(400);
  });
});

describe('custom pasted text', () => {
  it('runs live, detects the account by name, and is idempotent by content', async () => {
    const ws = newWs();
    const text = 'Notes from today with SunPeak Solar.\nCustomer: We still cannot export the call dashboard to CSV for anything over thirty days.\nCSM: logged it.';
    const r = await h.call('/runs', { method: 'POST', ws, json: { text, filename: 'notes.txt' } });
    expect(r.status).toBe(201);
    const d = await waitForRun(h, r.json.data.runId, ws);
    expect(d.run.accountId).toBe('acct_sunpeak');
    expect(d.run.fileId).toBeNull();
    const dup = await h.call('/runs', { method: 'POST', ws, json: { text, filename: 'again.txt' } });
    expect(dup.json.data.duplicate).toBe(true);
    expect((await h.call('/runs', { method: 'POST', ws, json: { text: 'too short' } })).status).toBe(400);
  });

  it('flags prompt injection and keeps everything in review', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_injection' } });
    const d = await waitForRun(h, r.json.data.runId, ws);
    expect(d.run.injectionFlagged).toBe(true);
    expect(d.steps.find((s: any) => s.key === 'screen').status).toBe('warned');
    expect(d.insights.every((i: any) => i.gate === 'review' || i.gate === 'dropped')).toBe(true);
    expect(d.deliveries.length).toBe(0);
  });

  it('a nothing-actionable file yields zero insights and skips extraction', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_friendly' } });
    const d = await waitForRun(h, r.json.data.runId, ws);
    expect(d.run.status).toBe('completed');
    expect(d.run.actionable).toBe(false);
    expect(d.insights.length).toBe(0);
    expect(d.steps.find((s: any) => s.key === 'extract').status).toBe('skipped');
  });
});

describe('model fallback and failure handling', () => {
  it('falls back to the secondary model when the primary is down', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_fallback' } });
    const d = await waitForRun(h, r.json.data.runId, ws);
    const extract = d.steps.find((s: any) => s.key === 'extract');
    expect(extract.status).toBe('warned');
    expect(extract.model).toBe('anthropic/claude-haiku-5.5');
    expect(extract.detail.fellBack).toBe(true);
    const anth = h.mock.requests.filter((q) => q.model.startsWith('anthropic/') && q.user.includes('PRIMARY_DOWN'));
    expect(anth.length).toBeGreaterThan(0);
    for (const q of anth) expect(q.body.temperature).toBeUndefined();
    const fb = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM ai_calls WHERE run_id = ? AND fallback = 1').bind(d.run.id).first<{ n: number }>();
    expect(fb!.n).toBeGreaterThan(0);
  });

  it('a failed live run on a featured file falls back to its replay (live_failed) and writes a DLQ row', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_broken' } });
    expect(r.json.data.mode).toBe('live');
    const d = await waitForRun(h, r.json.data.runId, ws, (x) => x.run.mode === 'replay');
    expect(d.run.modeReason).toBe('live_failed');
    const dlq = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM dlq WHERE run_id = ?').bind(r.json.data.runId).first<{ n: number }>();
    expect(dlq!.n).toBeGreaterThan(0);
    const health = await h.call('/health', { ws });
    expect(health.json.data.dlq.some((x: any) => x.runId === r.json.data.runId)).toBe(true);
    const done = await waitForRun(h, r.json.data.runId, ws, (x) => x.run.status !== 'running');
    expect(done.steps.every((s: any) => s.finishedAt)).toBe(true);
    expect(done.insights.length).toBeGreaterThan(0);
  });

  it('a live run slower than the limit is replaced by its replay', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_slow' } });
    expect(r.json.data.mode).toBe('live');
    const d = await waitForRun(h, r.json.data.runId, ws, (x) => x.run.mode === 'replay', 30_000);
    expect(d.run.modeReason).toBe('live_failed');
  }, 40_000);
});

describe('budget', () => {
  it('when the budget is reached, library files replay and pasted text gets budget_reached', async () => {
    const ws = newWs();
    await h.env.DB.prepare("INSERT INTO ai_calls (id, run_id, workspace_id, purpose, model, tokens_in, tokens_out, cost_usd, ms, ok, key_scope, created_at) VALUES ('aic_budget_fill', NULL, NULL, 'extract', 'x', 0, 0, 14.995, 1, 1, 'runtime', ?)").bind(new Date().toISOString()).run();
    try {
      const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_meridian_phi' } });
      expect(r.status).toBe(201);
      expect(r.json.data.mode).toBe('replay');
      expect(r.json.data.modeReason).toBe('budget_reached');
      // Progressive reveal: right away most steps are pending/running.
      const early = (await h.call(`/runs/${r.json.data.runId}`, { ws })).json.data;
      expect(early.run.mode).toBe('replay');
      expect(early.steps.some((s: any) => s.status === 'pending' || s.status === 'running')).toBe(true);
      const done = await waitForRun(h, r.json.data.runId, ws, (x) => x.run.status !== 'running');
      expect(done.steps.every((s: any) => s.finishedAt)).toBe(true);
      expect(done.steps.map((s: any) => s.key)).toHaveLength(10);
      expect(done.insights.length).toBeGreaterThan(0);
      const text = await h.call('/runs', { method: 'POST', ws, json: { text: 'A brand new pasted note that has never been seen before by the system at all.' } });
      expect(text.status).toBe(409);
      expect(text.json.error.code).toBe('budget_reached');
      const session = (await h.call('/session', { ws })).json.data;
      expect(session.budget.liveEnabled).toBe(false);
      expect(session.budget.reason).toBe('budget_reached');
      expect(session.budget.spentUsd).toBeGreaterThan(14.9);
    } finally {
      await h.env.DB.prepare("DELETE FROM ai_calls WHERE id = 'aic_budget_fill'").run();
      await h.env.DB.prepare("UPDATE settings SET value = 'true' WHERE key = 'live_enabled'").run();
      await h.env.KV.put('live_enabled', 'true');
    }
  });

  it('mode replay can be requested explicitly', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_c1042', mode: 'replay' } });
    expect(r.json.data.mode).toBe('replay');
    expect(r.json.data.modeReason).toBe('requested');
  });
});

describe('workspace isolation & reset', () => {
  it("a viewer never sees another viewer's runs and reset clears only their own", async () => {
    const a = newWs();
    const b = newWs();
    const r = await h.call('/runs', { method: 'POST', ws: a, json: { fileId: 'file_c1042', mode: 'replay' } });
    const runId = r.json.data.runId;
    expect((await h.call(`/runs/${runId}`, { ws: a })).status).toBe(200);
    expect((await h.call(`/runs/${runId}`, { ws: b })).status).toBe(404);
    expect((await h.call('/runs', { ws: b })).json.data.some((x: any) => x.id === runId)).toBe(false);
    expect((await h.call('/runs', { ws: a })).json.data.some((x: any) => x.id === runId)).toBe(true);
    // Rule override is per workspace.
    const rules = (await h.call('/routing/rules', { ws: a })).json.data;
    const rule = { ...rules[0], ownerId: 'ppl_renee', destination: '#vp-only' };
    const put = await h.call(`/routing/rules/${rule.id}`, { method: 'PUT', ws: a, json: rule });
    expect(put.status).toBe(200);
    expect(put.json.data.workspaceId).toBe(a);
    expect((await h.call('/routing/rules', { ws: a })).json.data.find((x: any) => x.id === rule.id).destination).toBe('#vp-only');
    expect((await h.call('/routing/rules', { ws: b })).json.data.find((x: any) => x.id === rule.id).destination).not.toBe('#vp-only');
    expect((await h.call(`/routing/rules/other`, { method: 'PUT', ws: a, json: rule })).status).toBe(400);
    // Reset.
    expect((await h.call('/workspace/reset', { method: 'POST', ws: a })).status).toBe(200);
    expect((await h.call(`/runs/${runId}`, { ws: a })).status).toBe(404);
    expect((await h.call('/routing/rules', { ws: a })).json.data.find((x: any) => x.id === rule.id).destination).not.toBe('#vp-only');
  });
});

describe('routing preview, settings, evals, telemetry', () => {
  it('routing preview returns Sankey flows for a proposed rule set', async () => {
    const ws = newWs();
    await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_c1042', mode: 'replay' } });
    await new Promise((r) => setTimeout(r, 3000));
    const rules = (await h.call('/routing/rules', { ws })).json.data;
    const r = await h.call('/routing/preview', { method: 'POST', ws, json: rules });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.data.flows)).toBe(true);
    expect((await h.call('/routing/preview', { method: 'POST', ws, json: [{ bad: true }] })).status).toBe(400);
  });

  it('settings are readable by all and writable only by the owner', async () => {
    const ws = newWs();
    const s = await h.call('/settings', { ws });
    expect(s.json.data.thresholds.autoRoute).toBe(0.8);
    expect((await h.call('/settings', { method: 'PUT', ws, json: { liveEnabled: false } })).status).toBe(403);
    const own = await h.call('/settings', { method: 'PUT', ws, auth: 'owner', json: { thresholds: { autoRoute: 0.85, review: 0.55, grounding: 0.9 } } });
    expect(own.status).toBe(200);
    expect(own.json.data.thresholds.autoRoute).toBe(0.85);
    await h.call('/settings', { method: 'PUT', ws, auth: 'owner', json: { thresholds: { autoRoute: 0.8, review: 0.55, grounding: 0.9 } } });
    expect((await h.call('/settings', { method: 'PUT', ws, auth: 'owner', json: { thresholds: { autoRoute: 0.5, review: 0.7, grounding: 0.9 } } })).status).toBe(400);
  });

  it('evals 404 until loaded, then return latest + candidate', async () => {
    const ws = newWs();
    expect((await h.call('/evals', { ws })).status).toBe(404);
    const run = { id: 'eval_v4', promptVersion: 'v4', model: 'm', judgeModel: null, createdAt: new Date().toISOString(), files: 1, promoted: true, blockedReasons: [], metrics: [], costUsd: 0, p50Ms: 1, p95Ms: 2 };
    await h.env.DB.prepare("INSERT INTO eval_runs (id, prompt_version, role, created_at, data) VALUES ('eval_v4','v4','promoted',?,?), ('eval_v5','v5','candidate',?,?)").bind(run.createdAt, JSON.stringify(run), run.createdAt, JSON.stringify({ ...run, id: 'eval_v5', promptVersion: 'v5', promoted: false, blockedReasons: ['recall'] })).run();
    const r = await h.call('/evals', { ws });
    expect(r.status).toBe(200);
    expect(r.json.data.latest.promptVersion).toBe('v4');
    expect(r.json.data.candidate.promoted).toBe(false);
  });

  it('telemetry accepts a valid batch and rejects bad input with 400 (never 500)', async () => {
    const ws = newWs();
    const ok = await h.call('/telemetry', { method: 'POST', ws, json: { sessionId: 's1', events: [{ kind: 'page_view', path: '/app', at: new Date().toISOString(), durationMs: 1200 }] } });
    expect(ok.status).toBe(200);
    expect(ok.json.data.accepted).toBe(1);
    expect((await h.call('/telemetry', { method: 'POST', ws, json: { sessionId: 's1', events: [{ kind: 'nope' }] } })).status).toBe(400);
    expect((await h.call('/telemetry', { method: 'POST', ws, body: 'not json', headers: { 'content-type': 'application/json' } })).status).toBe(400);
  });

  it('health reports budget, ledger and recent calls', async () => {
    const r = await h.call('/health', { ws: newWs() });
    expect(r.status).toBe(200);
    expect(r.json.data.budget.limitUsd).toBe(15);
    expect(r.json.data.ledger.length).toBeGreaterThan(0);
    expect(r.json.data.recent.length).toBeGreaterThan(0);
    expect(r.json.data.ledger[0]).toHaveProperty('p95Ms');
  });

  it('unknown endpoints are JSON 404s', async () => {
    const r = await h.call('/nope', { ws: newWs() });
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe('not_found');
  });
});
