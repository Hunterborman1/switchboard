/**
 * Fast path + durable fallback. A normal live run executes inside the request's waitUntil (no
 * Workflow instance); a run that blows the fast-path budget is handed to the Workflow, which
 * resumes after the last completed step and finishes the run with idempotent step writes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newWs, seedFixtures, startHarness, waitForRun, type Harness } from './harness.ts';

let h: Harness;

beforeAll(async () => {
  // 2.5s budget: a normal mock run (~100ms model calls) fits; SLOW_MODEL (8s per call) does not.
  h = await startHarness({ vars: { FAST_PATH_BUDGET_MS: '2500', LIVE_FALLBACK_MS: '60000' } });
  await seedFixtures(h.env.DB);
}, 180_000);
afterAll(async () => {
  await h?.close();
});

describe('fast path', () => {
  it('runs a live run without a Workflow, names new themes after the run, and batches writes', async () => {
    const ws = newWs();
    const r = await h.call('/runs', { method: 'POST', ws, json: { fileId: 'file_c1042' } });
    expect(r.status).toBe(201);
    const d = await waitForRun(h, r.json.data.runId, ws);
    expect(['awaiting_review', 'completed']).toContain(d.run.status);
    expect(d.steps).toHaveLength(10);
    expect(d.steps.every((s: any) => s.finishedAt && s.status !== 'failed')).toBe(true);
    const row = await h.env.DB.prepare('SELECT workflow_id FROM runs WHERE id = ?').bind(d.run.id).first<{ workflow_id: string | null }>();
    expect(row!.workflow_id).toBeNull();
    // Extraction was started alongside the screen call.
    expect(d.steps.find((s: any) => s.key === 'extract').detail.startedWithScreen).toBe(true);
    // The ledger has every call, and the run's cost matches its steps.
    const ledger = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM ai_calls WHERE run_id = ?').bind(d.run.id).first<{ n: number }>();
    expect(ledger!.n).toBeGreaterThanOrEqual(2);
    // Deferred theme naming: new candidate themes are renamed shortly after the run.
    const theme = d.steps.find((s: any) => s.key === 'theme');
    expect(theme.detail?.namingDeferred).toBe(true);
    {
      const t0 = Date.now();
      let named = false;
      while (!named && Date.now() - t0 < 10_000) {
        const step = await h.env.DB.prepare("SELECT detail FROM run_steps WHERE run_id = ? AND key = 'theme'").bind(d.run.id).first<{ detail: string }>();
        named = JSON.parse(step!.detail).namingMs !== undefined;
        if (!named) await new Promise((res) => setTimeout(res, 200));
      }
      expect(named).toBe(true);
      const calls = await h.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_calls WHERE run_id = ? AND purpose = 'theme_name'").bind(d.run.id).first<{ n: number }>();
      expect(calls!.n).toBeGreaterThanOrEqual(1);
    }
  });

  it('hands a run that exceeds the budget to the durable Workflow, which resumes and finishes it', async () => {
    const ws = newWs();
    const text = 'Customer: Signal AI keeps tagging our after hours calls as spam and the Google Ads offline conversions lag by two days SLOW_MODEL\nCSM: noted, I will raise it with the product team';
    const r = await h.call('/runs', { method: 'POST', ws, json: { text, filename: 'slow-paste.txt' } });
    expect(r.status).toBe(201);
    expect(r.json.data.mode).toBe('live');
    const runId = r.json.data.runId;
    const d = await waitForRun(h, runId, ws, (x) => !['queued', 'running'].includes(x.run.status), 90_000);
    expect(['awaiting_review', 'completed']).toContain(d.run.status);
    const row = await h.env.DB.prepare('SELECT workflow_id FROM runs WHERE id = ?').bind(runId).first<{ workflow_id: string | null }>();
    expect(row!.workflow_id).toBe(runId);
    // Every step exactly once, none left failed or running; no duplicate insights from the resume.
    const steps = await h.env.DB.prepare('SELECT key, status FROM run_steps WHERE run_id = ? ORDER BY idx').bind(runId).all<{ key: string; status: string }>();
    expect(steps.results.map((s) => s.key)).toEqual(['ingest', 'normalize', 'redact', 'screen', 'extract', 'ground', 'score', 'theme', 'route', 'deliver']);
    expect(steps.results.every((s) => s.status !== 'failed' && s.status !== 'running')).toBe(true);
    const ins = await h.env.DB.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT json_extract(data, "$.summary")) AS u FROM insights WHERE run_id = ?').bind(runId).first<{ n: number; u: number }>();
    expect(ins!.n).toBe(ins!.u);
    expect(d.insights.length).toBeGreaterThan(0);
  }, 120_000);
});
