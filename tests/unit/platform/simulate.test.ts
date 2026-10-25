import { describe, expect, it } from 'vitest';
import { simulate } from '../../../scripts/platform/simulate';
import { buildSeedStatements } from '../../../scripts/platform/seed';
import { IngestBatch, STANDARD_CHECKS, SIGNAL_LOOP_AGENT_ID } from '../../../src/shared/platform-contracts';

const sim = simulate();

describe('simulated org history', () => {
  it('is deterministic for a seed and end date', () => {
    const again = simulate();
    expect(again.work.map((w) => w.id + w.at + w.outcome)).toEqual(sim.work.map((w) => w.id + w.at + w.outcome));
    expect(again.logs.length).toBe(sim.logs.length);
  });

  it('covers 2026-09-14 → 2026-10-24 and stays small', () => {
    expect(sim.window).toEqual({ from: '2026-09-14', to: '2026-10-24' });
    expect(sim.agents.map((a) => a.record.id)).toEqual([SIGNAL_LOOP_AGENT_ID, 'agt_rfp_responder']);
    expect(sim.logs.length).toBeLessThanOrEqual(5000);
    expect(sim.events.length).toBeLessThan(1500);
    const inWindow = (t: string) => t >= '2026-09-14' && t <= '2026-10-24T23:59:59.999Z';
    expect(sim.events.every((e) => inWindow(e.at))).toBe(true);
    expect(sim.work.every((w) => inWindow(w.at))).toBe(true);
  });

  it('labels every row simulated and matches the ingest contract', () => {
    for (const a of sim.agents) {
      const batch = { agentId: a.record.id, events: sim.events.filter((e) => e.agentId === a.record.id), logs: sim.logs.filter((l) => l.agentId === a.record.id), spans: sim.spans.filter((s) => s.agentId === a.record.id).map(({ source: _s, ...s }) => s), work: sim.work.filter((w) => w.agentId === a.record.id) };
      expect(IngestBatch.safeParse(batch).success).toBe(true);
    }
    expect(sim.events.every((e) => e.source === 'simulated')).toBe(true);
    expect(sim.work.every((w) => w.source === 'simulated')).toBe(true);
  });

  it('peaks on weekdays mid-morning and early afternoon Pacific', () => {
    const weekday = sim.events.filter((e) => [1, 2, 3, 4, 5].includes(new Date(e.at).getUTCDay())).length;
    expect(weekday / sim.events.length).toBeGreaterThan(0.9);
    const ptHour = (t: string) => (new Date(t).getUTCHours() + 24 - 7) % 24;
    const peak = sim.events.filter((e) => [9, 10, 13, 14].includes(ptHour(e.at))).length;
    const night = sim.events.filter((e) => [0, 1, 2, 3, 4].includes(ptHour(e.at))).length;
    expect(peak).toBeGreaterThan(night * 10);
  });

  it('plants the Signal Loop incident: fallbacks and exactly one failed run inside its window', () => {
    const inc = (t: string) => t >= '2026-10-13T16:00:00Z' && t <= '2026-10-13T18:31:00Z';
    const failed = sim.work.filter((w) => w.agentId === SIGNAL_LOOP_AGENT_ID && w.outcome === 'failed');
    expect(failed).toHaveLength(1);
    expect(inc(failed[0]!.at)).toBe(true);
    const fallbacks = sim.logs.filter((l) => l.event === 'ai.call' && l.fields.fallback === true && inc(l.at));
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it('gives Gumloop a slower latency profile than Signal Loop’s API', () => {
    const p50 = (id: string) => {
      const d = sim.logs.filter((l) => l.agentId === id && l.event === 'http.request').map((l) => l.durationMs ?? 0).sort((a, b) => a - b);
      return d[Math.floor(d.length / 2)]!;
    };
    expect(p50('agt_rfp_responder')).toBeGreaterThan(p50(SIGNAL_LOOP_AGENT_ID) * 50);
  });

  it('every run has a connected trace (spans with a single root)', () => {
    const run = sim.logs.find((l) => l.event === 'run.finished')!;
    const spans = sim.spans.filter((s) => s.traceId === run.traceId);
    const ids = new Set(spans.map((s) => s.spanId));
    expect(spans.filter((s) => !s.parentId)).toHaveLength(1);
    expect(spans.filter((s) => s.parentId).every((s) => ids.has(s.parentId!))).toBe(true);
  });

  it('registry records carry all nine standard checks; the RFP agent has the one planned gap', () => {
    for (const a of sim.agents) expect(a.record.standard.map((c) => c.key)).toEqual(STANDARD_CHECKS.map((c) => c.key));
    const rfp = sim.agents.find((a) => a.record.id === 'agt_rfp_responder')!;
    expect(rfp.record.standard.filter((c) => !c.passed).map((c) => c.key)).toEqual(['evals']);
  });

  it('shifts the whole window with --end and keeps weekday alignment when shifted by weeks', () => {
    const later = simulate({ end: '2026-10-31' });
    expect(later.window.from).toBe('2026-09-21');
    expect(later.agents[0]!.record.nextReview).toBe('2026-11-18');
    expect(later.work.length).toBe(sim.work.length);
  });

  it('seed SQL replaces only simulated rows', () => {
    const stmts = buildSeedStatements(sim, '2026-10-24T00:00:00.000Z');
    expect(stmts[0]).toBe("DELETE FROM usage_events WHERE source = 'simulated';");
    expect(stmts.some((s) => /DELETE FROM (logs|spans|work_units) WHERE source = 'simulated'/.test(s))).toBe(true);
    expect(stmts.some((s) => s.includes("source = 'live'"))).toBe(false);
  });
});
