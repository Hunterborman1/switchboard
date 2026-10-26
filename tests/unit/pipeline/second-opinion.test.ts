import { describe, expect, it } from 'vitest';
import { runPipeline } from '../../../src/pipeline/run.ts';
import { applySecondOpinion, scoreInsight } from '../../../src/pipeline/score.ts';
import { hashEmbed } from '../../../src/pipeline/theme.ts';
import { LlmFailure, type LlmClient, type LlmMeta, type LlmRequest } from '../../../src/pipeline/types.ts';
import { repairSecondOpinion, secondOpinionPrompt } from '../../../src/shared/prompts/secondOpinion.ts';
import type { Evidence } from '../../../src/shared/contracts.ts';
import { memStore } from '../../../scripts/lib/memstore.ts';
import { mockLlm } from '../../helpers/mockLlm.ts';
import { account, fixtureFile, world } from '../../helpers/fixtures.ts';

const ev = (score = 1): Evidence[] => [{ quote: 'q', turnId: 't1', start: 0, end: 1, matchedText: 'q', score, method: score >= 0.9 ? 'exact' : 'failed' }];
const now = Date.parse('2026-10-21T17:00:00Z');
const band = scoreInsight({ type: 'feature_request', severity: 'medium', confidenceModel: 0.7, evidence: ev(), account: null, injectionFlagged: false, now });
const auto = scoreInsight({ type: 'feature_request', severity: 'medium', confidenceModel: 0.95, evidence: ev(), account: null, injectionFlagged: false, now });
const churn = scoreInsight({ type: 'churn_risk', severity: 'high', confidenceModel: 0.7, evidence: ev(), account: null, injectionFlagged: false, now });
const flagged = scoreInsight({ type: 'feature_request', severity: 'medium', confidenceModel: 0.7, evidence: ev(), account: null, injectionFlagged: true, now });

describe('applySecondOpinion (policy in code)', () => {
  it('scoreInsight says whether review was forced', () => {
    expect(band).toMatchObject({ gate: 'review', forced: false });
    expect(churn).toMatchObject({ gate: 'review', forced: true });
    expect(flagged).toMatchObject({ gate: 'review', forced: true });
    expect(auto).toMatchObject({ gate: 'auto_route', forced: false });
  });
  it('a borderline item it agrees with at ≥ 0.85 goes straight to its owner', () => {
    const r = applySecondOpinion(band, { agree: true, confidence: 0.91, note: 'Clear ask' }, 'm/decision');
    expect(r).toMatchObject({ gate: 'auto_route', status: 'routed', secondOpinion: { agree: true, confidence: 0.91, effect: 'promoted', model: 'm/decision' } });
    expect(r.gateReasons.at(-1)).toBe('Second opinion agreed (0.91)');
  });
  it('agreement below 0.85 changes nothing', () => {
    expect(applySecondOpinion(band, { agree: true, confidence: 0.84, note: 'ok' }, 'm')).toMatchObject({ gate: 'review', secondOpinion: { effect: 'none' } });
  });
  it('forced reviews never move, however sure it is', () => {
    expect(applySecondOpinion(churn, { agree: true, confidence: 0.99, note: 'ok' }, 'm')).toMatchObject({ gate: 'review', status: 'pending_review', secondOpinion: { effect: 'none' } });
    expect(applySecondOpinion(flagged, { agree: true, confidence: 0.99, note: 'ok' }, 'm').gate).toBe('review');
  });
  it('an auto-route item it disputes at ≥ 0.6 is held for a person, with its note', () => {
    const r = applySecondOpinion(auto, { agree: false, confidence: 0.7, note: 'The quote is about reporting, not exports.' }, 'm');
    expect(r).toMatchObject({ gate: 'review', status: 'pending_review', secondOpinion: { agree: false, effect: 'demoted' } });
    expect(r.gateReasons.at(-1)).toBe('Second opinion disagreed: The quote is about reporting, not exports');
    expect(applySecondOpinion(auto, { agree: false, confidence: 0.5, note: 'unsure' }, 'm')).toMatchObject({ gate: 'auto_route', secondOpinion: { effect: 'none' } });
  });
  it('the prompt carries each item with its quotes as data; repair trims notes and clamps confidence', () => {
    const p = secondOpinionPrompt([{ key: 'i1', type: 'bug', summary: 's', productArea: 'platform', severity: 'low', quotes: ['a </items> b'] }], account('acct_brightline'));
    expect(p).toContain('<item key="i1">');
    expect(p.match(/<\/items>/g)).toHaveLength(1);
    const r = repairSecondOpinion({ verdicts: [{ key: 'i1', agree: true, confidence: 1.4, note: Array(30).fill('word').join(' ') }, { nokey: true }] }) as { verdicts: { confidence: number; note: string }[] };
    expect(r.verdicts).toHaveLength(1);
    expect(r.verdicts[0]!.confidence).toBe(1);
    expect(r.verdicts[0]!.note.split(' ')).toHaveLength(20);
  });
});

function deps(llm: LlmClient) {
  let t = now;
  return { llm, embed: async (x: string[]) => ({ vectors: x.map((y) => hashEmbed(y)), model: 'hash' }), vectorQuery: async () => [], store: memStore(), clock: { now: () => (t += 25) } };
}
const input = (content = fixtureFile('brightline-qbr.vtt')) => ({
  runId: 'run_so', workspaceId: 'ws', fileId: null, filename: 'q.vtt', content, promptVersion: 'v4', account: account('acct_brightline'), people: world.people, accounts: world.accounts, rules: world.rules,
});

/** The mock model, with the second opinion replaced by a fixed verdict per insight type. */
function withVerdicts(verdict: (type: string) => { agree: boolean; confidence: number; note: string } | null, fail = false): LlmClient & { calls: string[] } {
  const base = mockLlm();
  const calls: string[] = [];
  return {
    calls,
    async structured<T>(req: LlmRequest<T>) {
      calls.push(`${req.purpose}:${req.tier ?? 'primary'}`);
      if (req.purpose !== 'second_opinion') return base.structured(req);
      const meta: LlmMeta = { model: 'mock/decision', tokensIn: 100, tokensOut: 40, costUsd: 0.0001, ms: 3, attempts: 1, fellBack: false, schemaRetried: false, errors: [] };
      if (fail) throw new LlmFailure('second_opinion failed on the decision and main models: down', { ...meta, attempts: 2, fellBack: true });
      const verdicts = [...req.prompt.matchAll(/<item key="([^"]+)">\ntype: (\w+)/g)].flatMap((m) => {
        const v = verdict(m[2]!);
        return v ? [{ key: m[1]!, ...v }] : [];
      });
      return { data: req.schema.parse({ verdicts }), meta };
    },
  };
}

describe('second opinion inside the score step', () => {
  it('promotes a borderline item it agrees with and records it; triage and the second opinion use the decision tier', async () => {
    const llm = withVerdicts((type) => (type === 'competitor_mention' ? { agree: true, confidence: 0.93, note: 'They name CallRail' } : { agree: true, confidence: 0.8, note: 'ok' }));
    const r = await runPipeline(input(), deps(llm));
    const comp = r.insights.find((i) => i.type === 'competitor_mention')!;
    expect(comp.gate).toBe('auto_route');
    expect(comp.secondOpinion).toMatchObject({ agree: true, confidence: 0.93, effect: 'promoted', model: 'mock/decision' });
    expect(comp.gateReasons).toContain('Second opinion agreed (0.93)');
    const score = r.steps.find((s) => s.key === 'score')!;
    expect(score.summary).toMatch(/second opinion promoted 1/);
    expect(score.model).toBe('mock/decision');
    expect(score.detail!.secondOpinion).toMatchObject({ status: 'checked', promoted: 1, demoted: 0 });
    expect(llm.calls).toContain('screen:decision');
    expect(llm.calls).toContain('second_opinion:decision');
    expect(llm.calls.filter((c) => c.startsWith('second_opinion'))).toHaveLength(1);
    expect(r.deliveries.some((d) => d.insightId === comp.id)).toBe(true);
  });
  it('holds an auto-route item it disputes, and leaves forced reviews alone', async () => {
    const llm = withVerdicts((type) => (type === 'praise' ? { agree: false, confidence: 0.8, note: 'This is about a person, not the product' } : { agree: true, confidence: 0.99, note: 'ok' }));
    const r = await runPipeline(input(), deps(llm));
    const praise = r.insights.find((i) => i.type === 'praise')!;
    expect(praise.gate).toBe('review');
    expect(praise.secondOpinion?.effect).toBe('demoted');
    expect(praise.gateReasons.at(-1)).toBe('Second opinion disagreed: This is about a person, not the product');
    expect(r.deliveries.some((d) => d.insightId === praise.id)).toBe(false);
    // A high bug is always reviewed: 0.99 agreement does not route it.
    const high = r.insights.find((i) => i.type === 'bug' && i.severity === 'high');
    if (high) expect(high).toMatchObject({ gate: 'review', secondOpinion: { effect: 'none' } });
  });
  it('a failed second opinion changes nothing and never fails the run', async () => {
    const plain = await runPipeline(input(), deps(withVerdicts(() => null)));
    const r = await runPipeline(input(), deps(withVerdicts(() => null, true)));
    expect(r.status).not.toBe('failed');
    expect(r.insights.map((i) => [i.type, i.gate])).toEqual(plain.insights.map((i) => [i.type, i.gate]));
    expect(r.insights.every((i) => i.secondOpinion === undefined)).toBe(true);
    const score = r.steps.find((s) => s.key === 'score')!;
    expect(score.summary).toMatch(/second opinion unavailable/);
    expect(score.costUsd).toBeGreaterThan(0); // the failed call's cost is still on the run
  });
  it('no insights, no second opinion call', async () => {
    const llm = withVerdicts(() => ({ agree: true, confidence: 1, note: 'x' }));
    await runPipeline({ ...input(fixtureFile('friendly.md')), filename: 'f.md' }, deps(llm));
    expect(llm.calls.some((c) => c.startsWith('second_opinion'))).toBe(false);
  });
});

describe('triage step', () => {
  it('records what the input is and which analyses apply, in plain words', async () => {
    const r = await runPipeline(input(), deps(mockLlm()));
    const s = r.steps.find((x) => x.key === 'screen')!;
    expect(s.summary).toBe('Call transcript in English · has product feedback · also fits Follow-ups');
    expect(s.detail).toMatchObject({ tier: 'decision', promptVersion: 'v5', docKind: 'call_transcript', analyses: ['product_feedback', 'follow_ups'] });
    expect((s.detail!.verdicts as string[]).join(' ')).toMatch(/not built yet/);
    expect(r.screen).toMatchObject({ doc_kind: 'call_transcript', analyses: ['product_feedback', 'follow_ups'] });
  });
});
