import { describe, expect, it } from 'vitest';
import { replayTotalMs, revealSteps, stepDone, toRecording, type StoredStep } from '../../../src/pipeline/replay.ts';
import { runPipeline } from '../../../src/pipeline/run.ts';
import { hashEmbed } from '../../../src/pipeline/theme.ts';
import { memStore } from '../../../scripts/lib/memstore.ts';
import { mockLlm } from '../../helpers/mockLlm.ts';
import { account, fixtureFile, world } from '../../helpers/fixtures.ts';

const step = (key: any, offsetMs: number, durationMs: number): StoredStep => ({ runId: 'r', key, status: 'passed', startedAt: null, finishedAt: null, durationMs, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0.001, summary: `${key} done`, detail: { a: 1 }, offsetMs });
const steps = [step('ingest', 0, 100), step('normalize', 100, 50), step('screen', 150, 1000), step('extract', 1150, 2000)];

describe('replay timing', () => {
  it('reveals steps progressively by elapsed time', () => {
    const t0 = Date.parse('2026-10-24T12:00:00Z');
    const at = (ms: number) => revealSteps(steps, t0, t0 + ms);
    expect(at(0).map((s) => s.status)).toEqual(['running', 'pending', 'pending', 'pending']);
    expect(at(120).map((s) => s.status)).toEqual(['passed', 'running', 'pending', 'pending']);
    const mid = at(1500);
    expect(mid.map((s) => s.status)).toEqual(['passed', 'passed', 'passed', 'running']);
    expect(mid[3]).toMatchObject({ summary: null, detail: null, model: null, costUsd: null, finishedAt: null });
    expect(mid[2]!.finishedAt).toBe(new Date(t0 + 1150).toISOString());
    expect(mid[2]!.startedAt).toBe(new Date(t0 + 150).toISOString());
    expect(at(3150).every((s) => s.status === 'passed' && s.summary)).toBe(true);
    expect(stepDone(mid, 'screen')).toBe(true);
    expect(stepDone(mid, 'extract')).toBe(false);
    expect(stepDone(mid, 'deliver')).toBe(false);
    expect(replayTotalMs(steps)).toBe(3150);
    expect(at(0).every((s) => !('offsetMs' in s))).toBe(true);
  });

  it('a recording carries offsets from the first step and no originals', async () => {
    let t = Date.parse('2026-10-21T17:00:00Z');
    const r = await runPipeline(
      { runId: 'run_r', workspaceId: 'rec', fileId: 'file_c1042', filename: 'qbr.vtt', content: fixtureFile('brightline-qbr.vtt'), promptVersion: 'v4', account: account('acct_brightline'), people: world.people, accounts: world.accounts, rules: world.rules },
      { llm: mockLlm(), embed: async (x) => ({ vectors: x.map((y) => hashEmbed(y)), model: 'h' }), vectorQuery: async () => [], store: memStore(), clock: { now: () => (t += 100) } },
    );
    const rec = toRecording('file_c1042', r, r.steps[0]!.startedAt!, 'v4');
    expect(rec.steps[0]!.offsetMs).toBe(0);
    expect(rec.steps.map((s) => s.offsetMs)).toEqual([...rec.steps.map((s) => s.offsetMs)].sort((a, b) => a - b));
    expect(rec.totalMs).toBeGreaterThan(0);
    expect(rec.steps).toHaveLength(10);
    const blob = JSON.stringify(rec);
    expect(blob).not.toContain('704-555-0142');
    expect(blob).not.toContain('Whitfield');
    expect(blob).not.toContain('modelInputs');
    expect(rec.run.status).toBe(r.status);
  });
});
