import { describe, expect, it } from 'vitest';
import { computeEval, matchFile, phiLeaks, redactQuote } from '../../../scripts/lib/match.ts';
import { runFile, themeIndex } from '../../../scripts/lib/core.ts';
import { loadGolden } from '../../../scripts/lib/data.ts';
import type { LibraryEntry, World } from '../../../scripts/lib/data.ts';
import { coerceTaxonomy } from '../../../src/shared/prompts/taxonomy.ts';
import { hashEmbed } from '../../../src/pipeline/theme.ts';
import { mockLlm } from '../../helpers/mockLlm.ts';
import { fixtureFile, world as fx } from '../../helpers/fixtures.ts';
import type { GoldenLabel } from '../../../src/shared/contracts.ts';
import { readFileSync } from 'node:fs';

const world: World = { ...fx, taxonomy: coerceTaxonomy(null), taxonomyRaw: null, source: 'fixtures' };
const golden = new Map((JSON.parse(readFileSync(new URL('../../fixtures/golden.json', import.meta.url), 'utf8')) as GoldenLabel[]).map((g) => [g.fileId, g]));
const lib = (id: string, file: string, accountId: string, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id, folder: 'x', filename: file, format: file.endsWith('.vtt') ? 'vtt' : file.endsWith('.eml') ? 'eml' : file.endsWith('.md') ? 'md' : file.endsWith('.chat') ? 'chat' : 'txt', sizeBytes: 1, modifiedAt: '2026-10-21T00:00:00Z',
  accountId, callType: 'x', messLevel: 3, edgeKind: null, featured: true, tourPath: null, recommended: false, callId: 'C-1', path: '', content: fixtureFile(file), ...extra,
});
const embed = async (t: string[]) => ({ vectors: t.map((x) => hashEmbed(x)), model: 'hash' });

describe('eval matching', () => {
  it('redactQuote swaps originals for tokens', () => {
    expect(redactQuote('call Dana Whitfield at 704-555-0142, Dana said', { '[PERSON_1]': 'Dana Whitfield', '[PHONE_1]': '704-555-0142' })).toBe('call [PERSON_1] at [PHONE_1], [PERSON_1] said');
  });

  it('matches golden insights by type + span overlap and computes metrics', async () => {
    const files = [
      lib('file_c1042', 'brightline-qbr.vtt', 'acct_brightline'),
      lib('file_meridian_phi', 'meridian-phi.txt', 'acct_meridian', { messLevel: null, edgeKind: 'phi_heavy' }),
      lib('file_sunpeak_injection', 'injection.eml', 'acct_sunpeak', { messLevel: null, edgeKind: 'injection' }),
      lib('file_sunpeak_friendly', 'friendly.md', 'acct_sunpeak', { messLevel: 1, edgeKind: 'nothing_actionable' }),
      lib('file_brightline_slack', 'slack.chat', 'acct_brightline', { messLevel: 5 }),
    ];
    const evals = [];
    for (const f of files) {
      const run = await runFile({ file: f, world, llm: mockLlm(), embed, index: themeIndex() });
      const g = golden.get(f.id)!;
      const match = await matchFile(run, g, null);
      evals.push({ run, golden: g, match, phiLeaked: phiLeaks(run, g) });
    }
    const c1042 = evals[0]!.match;
    expect(c1042.goldenSpans.every((s) => s !== null)).toBe(true);
    expect(c1042.pairs.length).toBe(5);
    expect(c1042.pairs.every((p) => p.via === 'span')).toBe(true);
    const ev = computeEval({ id: 'e', promptVersion: 'v4', model: 'mock', judgeModel: null, files: evals, costUsd: 0.01 });
    const m = (k: string) => ev.metrics.find((x) => x.key === k)!;
    expect(m('recall').value).toBe(1);
    expect(m('precision').value).toBe(1);
    expect(m('phi_leakage').value).toBe(0);
    expect(m('injection_flagged').value).toBe(1);
    expect(m('negative_fp_rate')).toMatchObject({ value: 0, numerator: 0, denominator: 1, passed: true });
    expect(m('routing_accuracy').denominator).toBeGreaterThan(0);
    expect(m('recall.level5')).toMatchObject({ value: 1, threshold: 0.7 });
    expect(ev.promoted).toBe(true);
    expect(ev.blockedReasons).toEqual([]);
    // A worse candidate regresses and is blocked with real reasons.
    const worse = computeEval({ id: 'e2', promptVersion: 'v5', model: 'mock', judgeModel: null, files: evals.map((e) => ({ ...e, match: { ...e.match, pairs: e.match.pairs.slice(0, Math.floor(e.match.pairs.length / 2)) } })), costUsd: 0.005, promoted: ev });
    expect(worse.promoted).toBe(false);
    expect(worse.blockedReasons.some((r) => r.startsWith('Recall (all types)'))).toBe(true);
    expect(worse.blockedReasons.some((r) => r.includes('No regression vs v4'))).toBe(true);
  });

  it('flags PHI that reached the model', async () => {
    const f = lib('file_meridian_phi', 'meridian-phi.txt', 'acct_meridian');
    const run = await runFile({ file: f, world, llm: mockLlm(), embed, index: null });
    expect(phiLeaks(run, golden.get('file_meridian_phi')!)).toEqual([]);
    run.result.modelInputs.push('leak: Maria Gonzalez');
    expect(phiLeaks(run, golden.get('file_meridian_phi')!)).toEqual(['Maria Gonzalez']);
  });

  it('loadGolden reads data/golden when present (schema-valid)', () => {
    const g = loadGolden();
    expect(g.size).toBeGreaterThan(0);
    for (const label of g.values()) expect(Array.isArray(label.insights)).toBe(true);
  });
});
