import { describe, expect, it } from 'vitest';
import { runPatch, runPipeline } from '../../../src/pipeline/run.ts';
import { hashEmbed, themeText } from '../../../src/pipeline/theme.ts';
import type { PipelineDeps, PipelineInput, ThemeCandidate } from '../../../src/pipeline/types.ts';
import { STEP_KEYS, type RunStep } from '../../../src/shared/contracts.ts';
import { memStore } from '../../../scripts/lib/memstore.ts';
import { mockLlm } from '../../helpers/mockLlm.ts';
import { account, fixtureFile, world } from '../../helpers/fixtures.ts';

function deps(extra: Partial<PipelineDeps> & { failPurposes?: string[] } = {}) {
  let t = Date.parse('2026-10-21T17:00:00Z');
  const store = memStore();
  const rows: RunStep[] = [];
  const llm = mockLlm({ failPurposes: extra.failPurposes });
  const d: PipelineDeps = {
    llm,
    embed: async (texts) => ({ vectors: texts.map((x) => hashEmbed(x)), model: 'hash' }),
    vectorQuery: async (): Promise<ThemeCandidate[]> => [],
    store,
    clock: { now: () => (t += 37) },
    onStep: (r) => void rows.push(r),
    ...extra,
  };
  return { d, store, rows, llm };
}

const input = (over: Partial<PipelineInput> = {}): PipelineInput => ({
  runId: 'run_1', workspaceId: 'ws_test', fileId: 'file_c1042', filename: 'brightline-qbr.vtt', content: fixtureFile('brightline-qbr.vtt'), promptVersion: 'v4',
  account: account('acct_brightline'), people: world.people, accounts: world.accounts, rules: world.rules, ...over,
});

describe('runPipeline', () => {
  it('runs all 10 steps on the Brightline QBR, emitting running + final rows', async () => {
    const { d, store, rows } = deps();
    const r = await runPipeline(input(), d);
    expect(r.error).toBeNull();
    expect(r.steps.map((s) => s.key)).toEqual([...STEP_KEYS]);
    expect(rows.length).toBe(20);
    expect(rows.filter((x) => x.status === 'running').length).toBe(10);
    expect(r.steps.every((s) => s.startedAt && s.finishedAt && s.summary)).toBe(true);
    expect(r.insights.length).toBeGreaterThanOrEqual(4);
    expect(r.redactions.some((x) => x.kind === 'phone')).toBe(true);
    expect(r.modelInputs.join('\n')).not.toMatch(/704-555-0142|dana\.whitfield@|Whitfield/);
    expect(r.modelInputs.join('\n')).toContain('<transcript>');
    expect(r.deliveries.length).toBe(r.insights.filter((i) => i.gate === 'auto_route').length);
    expect(r.notifications.length).toBe(r.deliveries.length);
    expect(store.state.insights.size).toBe(r.insights.length);
    expect(store.state.raw.size).toBe(1);
    expect(store.state.transcripts.get('run_1')!.doc.vault['[PERSON_1]']).toBe('Dana Whitfield');
    expect(r.status).toBe(r.insights.some((i) => i.status === 'pending_review') ? 'awaiting_review' : 'completed');
    expect(r.costUsd).toBeGreaterThan(0);
    expect(r.newThemes.length).toBeGreaterThan(0);
    expect(r.insights.filter((i) => i.gate !== 'dropped').every((i) => i.themeId && i.ownerId && i.channel)).toBe(true);
    const patch = runPatch(r, '2026-10-21T17:00:10Z');
    expect(patch).toMatchObject({ status: r.status, insightCount: r.insights.length, droppedCount: 0 });
  });

  it('drops an insight whose quote is not in the transcript and warns on ground', async () => {
    const { d } = deps();
    const content = `${fixtureFile('brightline-qbr.vtt')}\n\n00:04:00.000 --> 00:04:02.000\n<v Dana Whitfield (Brightline)>HALLUCINATE nothing else to add\n`;
    const r = await runPipeline(input({ content }), d);
    const dropped = r.insights.filter((i) => i.gate === 'dropped');
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.status).toBe('dropped_ungrounded');
    expect(dropped[0]!.evidence[0]!.method).toBe('failed');
    const ground = r.steps.find((s) => s.key === 'ground')!;
    expect(ground.status).toBe('warned');
    expect(ground.summary).toMatch(/1 insight dropped/);
    expect((ground.detail!.rejected as unknown[]).length).toBe(1);
    expect(r.deliveries.some((x) => x.insightId === dropped[0]!.id)).toBe(false);
  });

  it('a nothing-actionable file skips extraction and every downstream step', async () => {
    const { d, llm } = deps();
    const r = await runPipeline(input({ content: fixtureFile('friendly.md'), filename: 'friendly.md', account: account('acct_sunpeak') }), d);
    expect(r.status).toBe('completed');
    expect(r.actionable).toBe(false);
    expect(r.insights).toEqual([]);
    expect(r.steps.slice(4).every((s) => s.status === 'skipped')).toBe(true);
    expect(llm.calls.map((c) => c.purpose)).toEqual(['screen']);
  });

  it('an injection is flagged (heuristic + model), shown as data, and forces review', async () => {
    const { d } = deps();
    const r = await runPipeline(input({ content: fixtureFile('injection.eml'), filename: 'x.eml', account: account('acct_sunpeak') }), d);
    expect(r.injectionFlagged).toBe(true);
    const screen = r.steps.find((s) => s.key === 'screen')!;
    expect(screen.status).toBe('warned');
    expect(screen.detail!.heuristicHit).toBe(true);
    expect(r.insights.every((i) => i.gate === 'review')).toBe(true);
    expect(r.deliveries).toHaveLength(0);
  });

  it('PHI is redacted before the model sees anything', async () => {
    const { d } = deps();
    const r = await runPipeline(input({ content: fixtureFile('meridian-phi.txt'), filename: 'm.txt', account: account('acct_meridian') }), d);
    const sent = r.modelInputs.join('\n');
    for (const phi of ['Maria Gonzalez', '03/14/1962', '4482913', '614-555-0199', '123-45-6789', '4111 1111 1111 1111', '42 Maple Street']) expect(sent).not.toContain(phi);
    expect(sent).toContain('[PATIENT_1]');
    expect(r.steps.find((s) => s.key === 'redact')!.detail!.phi).toBeGreaterThanOrEqual(3);
    expect(r.insights.find((i) => i.type === 'churn_risk')!.gate).toBe('review');
  });

  it('a screen outage falls back to "extract anyway" with a DLQ row', async () => {
    const { d, store } = deps({ failPurposes: ['screen'] });
    const r = await runPipeline(input(), d);
    expect(r.error).toBeNull();
    expect(r.steps.find((s) => s.key === 'screen')!.status).toBe('warned');
    expect(store.state.dlq.map((x) => x.step)).toEqual(['screen']);
    expect(r.insights.length).toBeGreaterThan(0);
  });

  it('an extraction outage fails the run (a partial failure reads as a failure) and writes a DLQ row', async () => {
    const { d, store, rows } = deps({ failPurposes: ['extract'] });
    const r = await runPipeline(input(), d);
    expect(r.status).toBe('failed');
    expect(r.error).toContain('extract failed');
    expect(rows.at(-1)!).toMatchObject({ key: 'extract', status: 'failed' });
    expect(store.state.dlq.map((x) => x.step)).toEqual(['extract']);
    expect(r.steps.map((s) => s.key)).toEqual(['ingest', 'normalize', 'redact', 'screen', 'extract']);
  });

  it('a theme-naming outage falls back to deterministic names', async () => {
    const { d } = deps({ failPurposes: ['theme_name'] });
    const r = await runPipeline(input(), d);
    expect(r.newThemes.length).toBeGreaterThan(0);
    expect(r.newThemes.every((t) => t.name.length > 0)).toBe(true);
  });

  it('joins an existing theme returned by the vector index', async () => {
    const existing = hashEmbed(themeText({ type: 'bug', productArea: 'integrations', summary: 'Offline conversions reach Google Ads days late and break bidding' }));
    const { d } = deps({ vectorQuery: async (v) => [{ themeId: 'thm_seed_gads', score: cosineSim(v, existing), type: 'bug', productArea: 'integrations', name: 'Offline conversions lag in Google Ads' }] });
    const r = await runPipeline(input(), d);
    const gads = r.insights.find((i) => i.summary.startsWith('Offline conversions'))!;
    expect(gads.themeId).toBe('thm_seed_gads');
    expect(r.steps.find((s) => s.key === 'theme')!.summary).toMatch(/Joined 1 existing theme/);
  });

  it('an embedding outage warns and leaves themes unassigned', async () => {
    const { d } = deps({ embed: async () => { throw new Error('ai down'); } });
    const r = await runPipeline(input(), d);
    expect(r.steps.find((s) => s.key === 'theme')!.status).toBe('warned');
    expect(r.insights.every((i) => i.themeId === null)).toBe(true);
    expect(r.status).not.toBe('failed');
  });

  it('uses the requested prompt version and the durable step wrapper', async () => {
    const seen: string[] = [];
    const { d, llm } = deps({ runStep: async (key, fn) => { seen.push(key); return fn(); } });
    const r = await runPipeline(input({ promptVersion: 'v5' }), d);
    expect(seen).toEqual([...STEP_KEYS]);
    expect(r.insights.every((i) => i.promptVersion === 'v5')).toBe(true);
    const extract = llm.calls.find((c) => c.purpose === 'extract')!;
    expect(extract.system).not.toContain('Example 1');
  });
});

function cosineSim(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i]! * b[i]!;
  return d;
}
