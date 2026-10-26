import { describe, expect, it } from 'vitest';
import { mergeExtractions, quotesOverlap, renderedChars, sameInsight, splitTurns, summarySimilarity, type Candidate, type WindowTurn } from '../../../src/pipeline/chunk.ts';
import { runPipeline } from '../../../src/pipeline/run.ts';
import { hashEmbed } from '../../../src/pipeline/theme.ts';
import { extractWindowCount, estimateRunCostUsd, EXTRACT_CHUNKING } from '../../../src/shared/scoring.ts';
import { memStore } from '../../../scripts/lib/memstore.ts';
import { mockLlm } from '../../helpers/mockLlm.ts';
import { account, fixtureFile, world } from '../../helpers/fixtures.ts';

const turn = (i: number, chars = 500): WindowTurn => ({ id: `t${String(i).padStart(3, '0')}`, speaker: 'Dana', role: 'customer', text: 'x'.repeat(chars) });
const opts = { thresholdChars: 3_000, windowChars: 2_000, overlapChars: 600 };

describe('splitTurns', () => {
  it('is one window under the threshold', () => {
    const w = splitTurns([turn(1), turn(2)], opts);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ from: 't001', to: 't002' });
  });
  it('windows cover every turn, stay within the size, overlap, and always move forward', () => {
    const turns = Array.from({ length: 30 }, (_, i) => turn(i + 1));
    const w = splitTurns(turns, opts);
    expect(w.length).toBeGreaterThan(5);
    const seen = new Set(w.flatMap((x) => x.turns.map((t) => t.id)));
    expect(seen.size).toBe(30);
    for (const x of w) expect(x.chars).toBeLessThanOrEqual(opts.windowChars);
    for (let i = 1; i < w.length; i++) {
      const prev = new Set(w[i - 1]!.turns.map((t) => t.id));
      const shared = w[i]!.turns.filter((t) => prev.has(t.id));
      expect(shared.reduce((n, t) => n + renderedChars(t), 0)).toBeGreaterThanOrEqual(opts.overlapChars);
      expect(w[i]!.from > w[i - 1]!.from).toBe(true);
    }
    expect(w.at(-1)!.to).toBe('t030');
  });
  it('cuts a turn longer than a window into pieces that keep its id', () => {
    const big: WindowTurn = { id: 't001', speaker: 'Document', role: 'unknown', text: Array.from({ length: 200 }, (_, i) => `Sentence number ${i} says something.`).join(' ') };
    const w = splitTurns([big, turn(2)], opts);
    expect(w.length).toBeGreaterThan(2);
    expect(w.flatMap((x) => x.turns).filter((t) => t.id === 't001').length).toBeGreaterThan(2);
    for (const x of w) expect(x.chars).toBeLessThanOrEqual(opts.windowChars + 50);
  });
});

const cand = (over: Partial<Candidate>): Candidate => ({
  type: 'bug', summary: 'Offline conversions reach Google Ads days late', product_area: 'integrations', severity: 'medium', sentiment: 'negative',
  evidence: [{ quote: 'the offline conversions thing is killing us', turn_id: 't010' }], confidence: 0.8, rationale: 'r', ...over,
});

describe('mergeExtractions', () => {
  it('keeps one copy of an insight found in two windows, at the higher confidence', () => {
    const a = cand({ confidence: 0.7 });
    const b = cand({ confidence: 0.9, summary: 'Offline conversions arrive in Google Ads days late and break bidding' });
    const other = cand({ type: 'praise', summary: 'Dispatchers love the call summaries', evidence: [{ quote: 'the dispatchers love them', turn_id: 't020' }] });
    const m = mergeExtractions([{ insights: [a, other] }, { insights: [b] }]);
    expect(m.duplicates).toBe(1);
    expect(m.insights).toHaveLength(2);
    expect(m.insights[0]!.confidence).toBe(0.9);
  });
  it('overlapping evidence in the same turn merges even when the summaries differ', () => {
    const a = cand({ summary: 'Bidding breaks because uploads lag' });
    const b = cand({ summary: 'Conversion sync is slow', evidence: [{ quote: 'offline conversions thing is killing us', turn_id: 't010' }] });
    expect(sameInsight(a, b)).toBe(true);
    expect(mergeExtractions([{ insights: [a] }, { insights: [b] }]).insights).toHaveLength(1);
  });
  it('different types, or unrelated summaries and quotes, are kept apart', () => {
    expect(sameInsight(cand({}), cand({ type: 'feature_request' }))).toBe(false);
    expect(sameInsight(cand({}), cand({ summary: 'Spam filter tags real callers', evidence: [{ quote: 'tagging half our after hours calls as spam', turn_id: 't030' }] }))).toBe(false);
    expect(summarySimilarity('a b c', 'x y z')).toBe(0);
    expect(quotesOverlap('the reports are slow', 'reports are slow')).toBe(true);
    expect(quotesOverlap('', 'x')).toBe(false);
  });
});

describe('chunked extraction in the pipeline', () => {
  it('a long input is extracted in parallel parts, merged, and grounded against the whole document', async () => {
    // Two dozen copies of the Brightline QBR in one file: the same feedback appears in several windows.
    const one = fixtureFile('brightline-qbr.vtt').replace(/^WEBVTT\s*/, '');
    const content = `WEBVTT\n\n${Array.from({ length: 24 }, () => one).join('\n\n')}`;
    let t = Date.parse('2026-10-21T17:00:00Z');
    const llm = mockLlm();
    const r = await runPipeline(
      { runId: 'run_long', workspaceId: 'ws', fileId: null, filename: 'long.vtt', content, promptVersion: 'v4', account: account('acct_brightline'), people: world.people, accounts: world.accounts, rules: world.rules },
      { llm, embed: async (x) => ({ vectors: x.map((y) => hashEmbed(y)), model: 'hash' }), vectorQuery: async () => [], store: memStore(), clock: { now: () => (t += 20) } },
    );
    expect(r.error).toBeNull();
    const extract = r.steps.find((s) => s.key === 'extract')!;
    expect(content.length).toBeGreaterThan(EXTRACT_CHUNKING.thresholdChars);
    expect(Number(extract.detail!.chunks)).toBeGreaterThan(1);
    expect(llm.calls.filter((c) => c.purpose === 'extract').length).toBe(extract.detail!.chunks);
    expect(Number(extract.detail!.duplicatesMerged)).toBeGreaterThan(0);
    expect(extract.summary).toMatch(/read in \d+ parts at once/);
    // Each kind of feedback once, every quote grounded in the full document.
    const summaries = r.insights.map((i) => i.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
    expect(r.insights.every((i) => i.evidence.every((e) => e.method !== 'failed'))).toBe(true);
    // Triage read a capped excerpt; extraction read every part.
    expect(r.modelInputs.length).toBe(1 + Number(extract.detail!.chunks));
  });
});

describe('budget sizing', () => {
  it('reservations grow with the input, include the extra windows and the decision model', () => {
    expect(extractWindowCount(10_000)).toBe(1);
    expect(extractWindowCount(100_000)).toBeGreaterThan(5);
    const models = ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-haiku-5.5', 'z-ai/glm-5.3-flash'];
    const small = estimateRunCostUsd(5_000, models);
    const big = estimateRunCostUsd(200_000, models);
    expect(big).toBeGreaterThan(small * 5);
    // The decision model's price is part of the "dearest model" bound.
    expect(estimateRunCostUsd(5_000, ['cheap/a', 'unknown/expensive'])).toBeGreaterThan(estimateRunCostUsd(5_000, models));
  });
});
