/**
 * Agent Ops against the real Worker and a real local D1 (wrangler createTestHarness, shared
 * with the backend's worker suite): ingest, the platform API behind the gate, live vs
 * simulated provenance, per-workspace writes, and the roll-forward of simulated history.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newWs, startHarness, type Harness } from '../harness.ts';
import { simulate } from '../../../scripts/platform/simulate.ts';
import { buildSeedStatements } from '../../../scripts/platform/seed.ts';
import { ingestInto } from '../../../src/worker/platform/ingest.ts';
import { rollForward } from '../../../src/worker/platform/store.ts';
import { SIGNAL_LOOP_AGENT_ID } from '../../../src/shared/platform-contracts.ts';

let h: Harness;
let db: D1Database;
const sim = simulate();

beforeAll(async () => {
  h = await startHarness();
  await h.worker.applyD1Migrations('PLATFORM_DB');
  db = ((await h.worker.getEnv()) as { PLATFORM_DB: D1Database }).PLATFORM_DB;
  const stmts = buildSeedStatements(sim, new Date().toISOString());
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40).map((s) => db.prepare(s)));
}, 240_000);
afterAll(async () => {
  await h?.close();
});

const P = (path: string) => `/platform${path}`;

describe('gate', () => {
  it('requires auth for every platform endpoint', async () => {
    for (const path of ['/overview', '/agents', '/usage', '/logs', '/observability', '/cost', '/standard', '/reviews', '/meta']) {
      const r = await h.call(P(path), { auth: 'none' });
      expect(r.status, path).toBe(401);
    }
  });
});

describe('reports over seeded history', () => {
  it('overview: two agents, impact totals, weekly series and attention', async () => {
    const r = await h.call(P('/overview'));
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(typeof r.json.dataAsOf).toBe('string');
    expect(d.totals.agentsInProduction).toBe(2);
    expect(d.totals.workUnits).toBe(sim.work.length);
    expect(d.totals.hoursReturned).toBeGreaterThan(50);
    expect(d.totals.roiMultiple).toBeGreaterThan(1);
    expect(d.weekly.length).toBeGreaterThanOrEqual(6);
    expect(d.agentRows.map((a: { agentId: string }) => a.agentId).sort()).toEqual(['agt_rfp_responder', SIGNAL_LOOP_AGENT_ID]);
    expect(d.attention.some((a: { kind: string; agentId: string }) => a.kind === 'standard_gap' && a.agentId === 'agt_rfp_responder')).toBe(true);
    expect(d.openAlerts.map((a: { id: string }) => a.id)).toContain('alr_hist_rfp_library');
    expect(d.reviewsDue.some((r2: { agentId: string; reviewStatus: string }) => r2.agentId === 'agt_rfp_responder' && r2.reviewStatus === 'due_soon')).toBe(true);
  });

  it('registry and agent detail', async () => {
    const reg = await h.call(P('/agents'));
    expect(reg.json.data).toHaveLength(2);
    const sl = reg.json.data.find((a: { id: string }) => a.id === SIGNAL_LOOP_AGENT_ID);
    expect(sl.href).toBe('/app');
    expect(sl.source).toBe('live');
    expect(sl.standardScore.total).toBe(9);
    const d = await h.call(P(`/agents/${SIGNAL_LOOP_AGENT_ID}`));
    expect(d.status).toBe(200);
    expect(d.json.data.changelog.length).toBeGreaterThan(5);
    expect(d.json.data.slos.map((s: { key: string }) => s.key)).toEqual(['run_success', 'p95_latency', 'grounding', 'delivery_success', 'cost_per_unit']);
    expect((await h.call(P('/agents/agt_nope'))).status).toBe(404);
  });

  it('observability: Signal Loop run success is at risk after the planted incident', async () => {
    const r = await h.call(P(`/observability?agentId=${SIGNAL_LOOP_AGENT_ID}&range=6w`));
    const run = r.json.data.slos.find((s: { key: string }) => s.key === 'run_success');
    expect(run.status).toBe('at_risk');
    expect(run.denominator - run.numerator).toBe(1);
    expect(r.json.data.hourly.length).toBeGreaterThanOrEqual(40);
    expect(r.json.data.models[0].model).toBe('deepseek/deepseek-v4.1-flash');
    expect(r.json.data.alerts.find((a: { id: string }) => a.id === 'alr_hist_sl_fallback').status).toBe('resolved');
  });

  it('logs: filters, cursor pagination and trace join', async () => {
    const first = await h.call(P(`/logs?agentId=${SIGNAL_LOOP_AGENT_ID}&level=warn,error&limit=5`));
    expect(first.json.data.rows).toHaveLength(5);
    expect(first.json.data.rows.every((l: { level: string }) => l.level === 'warn' || l.level === 'error')).toBe(true);
    const next = await h.call(P(`/logs?agentId=${SIGNAL_LOOP_AGENT_ID}&level=warn,error&limit=5&cursor=${encodeURIComponent(first.json.data.nextCursor)}`));
    expect(next.json.data.rows[0].id).not.toBe(first.json.data.rows[0].id);
    expect(next.json.data.rows[0].at <= first.json.data.rows[4].at).toBe(true);
    const run = sim.logs.find((l) => l.event === 'run.finished' && l.agentId === SIGNAL_LOOP_AGENT_ID)!;
    const t = await h.call(P(`/traces/${run.traceId}`));
    expect(t.json.data.spans.length).toBeGreaterThan(8);
    expect(t.json.data.logs.some((l: { event: string }) => l.event === 'ai.call')).toBe(true);
    expect((await h.call(P('/traces/doesnotexist'))).status).toBe(404);
    expect((await h.call(P('/traces/bad%20id!'))).status).toBe(400);
  });

  it('cost, standard and reviews', async () => {
    const c = await h.call(P('/cost'));
    expect(c.json.data.liveBudget.limitUsd).toBe(15);
    expect(c.json.data.agents).toHaveLength(2);
    const s = await h.call(P('/standard'));
    expect(s.json.data.checks).toHaveLength(9);
    const rv = await h.call(P('/reviews'));
    expect(rv.json.data[0].agentId).toBe('agt_rfp_responder');
  });
});

describe('live telemetry', () => {
  it('ingest stores a batch as live, rejects bad input without throwing, drops platform traffic', async () => {
    const now = new Date().toISOString();
    const traceId = 'feedc0de'.repeat(4);
    const ok = await ingestInto(db, {
      agentId: SIGNAL_LOOP_AGENT_ID,
      events: [{ id: 'evt_live_1', agentId: SIGNAL_LOOP_AGENT_ID, source: 'live', sessionId: 'ses_live_1', actorId: 'viewer:abc123', actorRole: 'viewer', kind: 'tour_step', path: '/walkthrough', props: {}, at: now, durationMs: null }],
      logs: [
        { id: 'log_live_1', agentId: SIGNAL_LOOP_AGENT_ID, source: 'live', at: now, level: 'info', component: 'ai', event: 'ai.call', message: 'extract via deepseek', traceId, spanId: 's1', runId: 'run_live_1', workspaceId: 'ws_abc123abc123abc1', durationMs: 900, fields: { model: 'deepseek/deepseek-v4.1-flash', costUsd: 0.0021 } },
        { id: 'log_live_2', agentId: SIGNAL_LOOP_AGENT_ID, source: 'live', at: now, level: 'info', component: 'api', event: 'http.request', message: 'GET /platform/overview → 200', traceId, spanId: null, runId: null, workspaceId: null, durationMs: 50, fields: { path: '/repo/invoca/api/platform/overview' } },
      ],
      spans: [{ traceId, spanId: 's1', parentId: null, agentId: SIGNAL_LOOP_AGENT_ID, name: 'ai.generate deepseek', start: now, durationMs: 900, status: 'ok', attrs: {} }],
      work: [{ id: 'wu_live_1', agentId: SIGNAL_LOOP_AGENT_ID, source: 'live', at: now, kind: 'call_processed', actorId: 'viewer:abc123', minutesSavedEstimate: 18, humanMinutesSpent: 0, aiCostUsd: 0.0021, outcome: 'automatic' }],
    });
    expect(ok.ok).toBe(true);
    expect(ok.inserted).toEqual({ events: 1, logs: 1, spans: 1, work: 1 });
    const bad = await ingestInto(db, { agentId: SIGNAL_LOOP_AGENT_ID, logs: [{ nope: true }] });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/invalid batch/);
    const again = await ingestInto(db, { agentId: SIGNAL_LOOP_AGENT_ID, work: [{ id: 'wu_live_1', agentId: SIGNAL_LOOP_AGENT_ID, source: 'live', at: now, kind: 'x', actorId: null, minutesSavedEstimate: 1, humanMinutesSpent: 0, aiCostUsd: 0, outcome: 'automatic' }] });
    expect(again.ok).toBe(true); // idempotent: same id ignored
  });

  it('usage marks the viewer’s own live session as "you"', async () => {
    const r = await h.call(P('/usage'), { ws: 'ws_abc123abc123abc1' });
    const live = r.json.data.live;
    expect(live.activeNow).toBeGreaterThanOrEqual(1);
    expect(live.tourStarts).toBeGreaterThanOrEqual(1);
    expect(r.json.data.liveSessions.find((s: { sessionId: string }) => s.sessionId === 'ses_live_1').isYou).toBe(true);
    const other = await h.call(P('/usage'), { ws: newWs() });
    expect(other.json.data.liveSessions.find((s: { sessionId: string }) => s.sessionId === 'ses_live_1').isYou).toBe(false);
  });

  it('your last run finds the viewer’s live trace; live spend feeds the $15 budget', async () => {
    const r = await h.call(P('/logs/your-last-run'), { ws: 'ws_abc123abc123abc1' });
    expect(r.json.data).toMatchObject({ runId: 'run_live_1', isYours: true });
    const c = await h.call(P('/cost'));
    expect(c.json.data.liveBudget.spentUsd).toBeCloseTo(0.0021, 4);
    const std = await h.call(P(`/agents/${SIGNAL_LOOP_AGENT_ID}`));
    expect(std.json.data.agent.standard.find((s: { key: string }) => s.key === 'logging').passed).toBe(true);
  });
});

describe('viewer-owned writes', () => {
  it('assumptions override applies to one workspace only, and resets', async () => {
    const mine = newWs();
    const put = await h.call(P('/assumptions'), { method: 'PUT', ws: mine, json: { loadedHourlyUsd: 120 } });
    expect(put.status).toBe(200);
    expect(put.json.data).toMatchObject({ loadedHourlyUsd: 120, isOverride: true });
    const a = await h.call(P('/overview'), { ws: mine });
    const b = await h.call(P('/overview'), { ws: newWs() });
    expect(a.json.data.assumptions.loadedHourlyUsd).toBe(120);
    expect(b.json.data.assumptions.loadedHourlyUsd).toBe(85);
    expect(a.json.data.totals.valueUsd / b.json.data.totals.valueUsd).toBeCloseTo(120 / 85, 3);
    expect((await h.call(P('/assumptions'), { method: 'PUT', ws: mine, json: { loadedHourlyUsd: 5 } })).status).toBe(400);
    const reset = await h.call(P('/assumptions'), { method: 'PUT', ws: mine, json: { loadedHourlyUsd: null } });
    expect(reset.json.data.loadedHourlyUsd).toBe(85);
  });

  it('acknowledging an alert is per workspace and is not resolving', async () => {
    const mine = newWs();
    const ack = await h.call(P('/alerts/alr_hist_rfp_library/acknowledge'), { method: 'POST', ws: mine, json: {} });
    expect(ack.status).toBe(200);
    const a = await h.call(P('/observability?agentId=agt_rfp_responder'), { ws: mine });
    const b = await h.call(P('/observability?agentId=agt_rfp_responder'), { ws: newWs() });
    expect(a.json.data.alerts.find((x: { id: string }) => x.id === 'alr_hist_rfp_library').status).toBe('acknowledged');
    expect(b.json.data.alerts.find((x: { id: string }) => x.id === 'alr_hist_rfp_library').status).toBe('open');
  });
});

describe('roll-forward', () => {
  it('moves simulated rows forward by whole weeks once, and never touches live rows', async () => {
    const live = await db.prepare("SELECT at FROM work_units WHERE id = 'wu_live_1'").first<{ at: string }>();
    const before = await db.prepare("SELECT value FROM meta WHERE key = 'sim_to'").first<{ value: string }>();
    const firstSim = await db.prepare("SELECT min(at) AS at FROM work_units WHERE source = 'simulated'").first<{ at: string }>();
    const future = new Date(Date.parse(`${before!.value}T12:00:00Z`) + 16 * 86_400_000);
    const days = await rollForward(db, future, true);
    expect(days).toBe(14);
    expect(await rollForward(db, future, true)).toBe(0);
    const after = await db.prepare("SELECT value FROM meta WHERE key = 'sim_to'").first<{ value: string }>();
    expect(Date.parse(after!.value) - Date.parse(before!.value)).toBe(14 * 86_400_000);
    const firstSim2 = await db.prepare("SELECT min(at) AS at FROM work_units WHERE source = 'simulated'").first<{ at: string }>();
    expect(Date.parse(firstSim2!.at) - Date.parse(firstSim!.at)).toBe(14 * 86_400_000);
    expect((await db.prepare("SELECT at FROM work_units WHERE id = 'wu_live_1'").first<{ at: string }>())!.at).toBe(live!.at);
    expect((await db.prepare("SELECT value FROM meta WHERE key = 'rolled_days'").first<{ value: string }>())!.value).toBe('14');
  });
});
