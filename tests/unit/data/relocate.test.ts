import { describe, expect, it } from 'vitest';
import { locateQuote, normalize, normalizeWithMap, similarity } from '../../../scripts/data/relocate.ts';

const TEXT = `00:01:12.000 --> 00:01:19.500
Dana Ortiz: But on the Google Ads side, the offline conversions are showing up two, sometimes three days after the call.

00:01:20.000 --> 00:01:24.100
Jeff Kim: callrail's been emailing me like every week their rep keeps telling me they push conversions to google same day`;

describe('normalize', () => {
  it('lowercases, drops punctuation and apostrophes, collapses whitespace', () => {
    expect(normalize("  It's   ALL, fine.\n")).toBe('its all fine');
  });
  it('maps normalized offsets back to the original', () => {
    const { norm, map } = normalizeWithMap('A, b');
    expect(norm).toBe('a b');
    expect(map).toEqual([0, 3, 3]); // the collapsed space maps to the next kept char
  });
});

describe('locateQuote', () => {
  it('finds exact quotes', () => {
    const r = locateQuote(TEXT, 'the offline conversions are showing up two, sometimes three days after the call');
    expect(r?.method).toBe('exact');
  });

  it('finds quotes that only differ in case and punctuation, returning the exact substring', () => {
    const r = locateQuote(TEXT, "CallRail's been emailing me, like, every week.");
    expect(r?.method).toBe('normalized');
    expect(TEXT.includes(r!.text)).toBe(true);
    expect(r!.text).toBe("callrail's been emailing me like every week");
  });

  it('finds paraphrased-by-ASR quotes with a fuzzy window', () => {
    const r = locateQuote(TEXT, 'Their rep keeps telling me they push conversions to Google the same day', 0.8);
    expect(r?.method).toBe('fuzzy');
    expect(TEXT.includes(r!.text)).toBe(true);
    expect(r!.score).toBeGreaterThan(0.85);
  });

  it('rejects quotes that are not in the text', () => {
    expect(locateQuote(TEXT, 'Signal AI is tagging our after-hours callers as spam', 0.8)).toBeNull();
  });

  it('similarity is 1 for identical strings and lower for different ones', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abc', 'abd')).toBeLessThan(1);
  });
});
