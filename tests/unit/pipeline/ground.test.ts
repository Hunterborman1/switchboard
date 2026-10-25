import { describe, expect, it } from 'vitest';
import { groundFragment, groundQuote, normalize } from '../../../src/pipeline/ground.ts';
import type { Turn } from '../../../src/shared/contracts.ts';

const texts = [
  'yeah so honestly the offline conversions thing is killing us. like they show up in google ads two, sometimes three days late',
  "and um Jeff keeps forwarding me these call rail emails, they're saying they do same day sync [crosstalk] I don't know",
  'the dispatchers love the new summaries, they’re “great” actually',
];
const doc = texts.join('\n');
const turns: Turn[] = [];
{
  let pos = 0;
  texts.forEach((t, i) => {
    turns.push({ id: `t00${i + 1}`, speaker: 'x', role: 'customer', ts: null, text: t, start: pos, end: pos + t.length });
    pos += t.length + 1;
  });
}

describe('normalize', () => {
  it('folds case, punctuation, quotes, fillers and markers while mapping back to the original', () => {
    const n = normalize('Um, the “Offline” [crosstalk] conversions — don’t!');
    expect(n.text).toBe('the offline conversions dont');
    expect(n.map.length).toBe(n.text.length);
    expect('Um, the “Offline” [crosstalk] conversions — don’t!'[n.map[0]!]).toBe('t');
  });
});

describe('groundQuote', () => {
  it('exact match', () => {
    const e = groundQuote('the offline conversions thing is killing us', 't001', doc, turns);
    expect(e).toMatchObject({ method: 'exact', score: 1, turnId: 't001' });
    expect(doc.slice(e.start!, e.end!)).toBe('the offline conversions thing is killing us');
    expect(e.matchedText).toBe('the offline conversions thing is killing us');
  });
  it('normalized match (case, punctuation, curly quotes, fillers)', () => {
    const e = groundQuote('The dispatchers LOVE the new summaries, they\'re "great" actually.', null, doc, turns);
    expect(e.method).toBe('normalized');
    expect(e.turnId).toBe('t003');
    const e2 = groundQuote('and Jeff keeps forwarding me these call rail emails', 't002', doc, turns);
    expect(e2.method).toBe('normalized'); // "and um Jeff" → filler dropped
  });
  it('fuzzy match tolerates small transcription differences', () => {
    const e = groundQuote('they show up in google ad two sometimes three day late', 't001', doc, turns);
    expect(e.method).toBe('fuzzy');
    expect(e.score).toBeGreaterThanOrEqual(0.9);
    expect(e.matchedText).toContain('google ads two');
  });
  it('rejects near misses that change the meaning', () => {
    const e = groundQuote('they show up in google ads one week late every single time', 't001', doc, turns);
    expect(e.method).toBe('failed');
    expect(e.score).toBeLessThan(0.9);
    expect(e.start).toBeNull();
    expect(e.matchedText).toBeNull();
  });
  it('rejects fabricated quotes', () => {
    expect(groundQuote('we need a native snowflake connector for the warehouse', null, doc, turns).method).toBe('failed');
  });
  it('grounds stitched quotes piecewise and in order', () => {
    const e = groundQuote('the offline conversions thing is killing us ... they do same day sync', null, doc, turns);
    expect(e.method).not.toBe('failed');
    expect(e.start).toBe(doc.indexOf('the offline'));
    expect(e.end).toBe(doc.indexOf('same day sync') + 'same day sync'.length);
    const outOfOrder = groundQuote('they do same day sync … the offline conversions thing is killing us', null, doc, turns);
    expect(outOfOrder.method).toBe('failed');
  });
  it('corrects a wrong turn id to the turn that actually contains the quote', () => {
    expect(groundQuote('the dispatchers love the new summaries', 't001', doc, turns).turnId).toBe('t003');
  });
  it('groundFragment handles empty and quote-wrapped input', () => {
    expect(groundFragment('   ', doc).ok).toBe(false);
    expect(groundFragment('"the offline conversions thing"', doc).method).toBe('exact');
  });
});
