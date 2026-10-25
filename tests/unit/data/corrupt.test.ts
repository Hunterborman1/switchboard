import { describe, expect, it } from 'vitest';
import { applyHomophones, corruptShorthand, corruptTurns, LEVEL_PARAMS, noiseScore, timeline } from '../../../scripts/data/corrupt.ts';
import { createRng } from '../../../scripts/data/lib/rng.ts';
import type { GenTurn } from '../../../scripts/data/lib/types.ts';
import { locateQuote, normalize } from '../../../scripts/data/relocate.ts';

const TURNS: GenTurn[] = [
  { speaker: 'Marcus Bell', text: "Okay, so I put an agenda in the invite. I wanted to go through the Q3 numbers and talk about Signal AI. Does that work?" },
  { speaker: 'Dana Ortiz', text: 'That works. I have a hard stop at eleven, just so you know.' },
  { speaker: 'Dana Ortiz', text: "But on the Google Ads side, the offline conversions are showing up two, sometimes three days after the call. And it's been most of September." },
  { speaker: 'Jeff Kim', text: "CallRail's been emailing me every week. Their rep keeps telling me they push conversions to Google same day. I don't know if that's true." },
  { speaker: 'Marcus Bell', text: "Got it. I'll open a ticket with our integrations team today and ask them to pull the upload logs for your account." },
  { speaker: 'Jeff Kim', text: "Signal AI is tagging a lot of our after-hours calls as spam, and they're not spam. They're people with a burst pipe at eleven at night." },
  { speaker: 'Dana Ortiz', text: 'Our finance team asked why PreSense is an add-on at all. His words were, it feels like paying twice.' },
  { speaker: 'Marcus Bell', text: "That's fair. I can put together a one-pager for Rob on what PreSense is doing for you specifically, with the numbers." },
];
const QUOTES = ['the offline conversions are showing up two, sometimes three days after the call', "Signal AI is tagging a lot of our after-hours calls as spam, and they're not spam."];
const render = (turns: GenTurn[]): string => turns.map((t) => `${t.speaker}: ${t.text}`).join('\n');

describe('corruptTurns', () => {
  it('is deterministic: same seed, same output', () => {
    for (const level of [3, 4, 5]) {
      expect(corruptTurns(TURNS, level, 'seed-a', QUOTES)).toEqual(corruptTurns(TURNS, level, 'seed-a', QUOTES));
    }
  });

  it('different seeds give different output at level 4+', () => {
    expect(render(corruptTurns(TURNS, 4, 'seed-a'))).not.toEqual(render(corruptTurns(TURNS, 4, 'seed-b')));
  });

  it('levels 1 and 2 are the identity', () => {
    expect(corruptTurns(TURNS, 1, 'x')).toEqual(TURNS);
    expect(corruptTurns(TURNS, 2, 'x')).toEqual(TURNS);
  });

  it('noise grows monotonically with level', () => {
    const clean = render(TURNS);
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const n = [2, 3, 4, 5].map((l) => noiseScore(clean, render(corruptTurns(TURNS, l, seed, QUOTES))));
      expect(n[0]).toBe(0);
      expect(n[1]).toBeLessThan(n[2] as number);
      expect(n[2]).toBeLessThan(n[3] as number);
    }
  });

  it('level parameters never decrease from one level to the next', () => {
    const keys = ['filler', 'stutter', 'inaudible', 'crosstalk', 'bleed', 'merge', 'lowercase', 'punctDrop', 'homophone'] as const;
    for (const k of keys) for (const l of [2, 3, 4] as const) expect(LEVEL_PARAMS[(l + 1) as 3 | 4 | 5][k]).toBeGreaterThanOrEqual(LEVEL_PARAMS[l][k]);
  });

  it('keeps protected quotes free of inserted noise and locatable', () => {
    for (const seed of ['p1', 'p2', 'p3', 'p4']) {
      const out = render(corruptTurns(TURNS, 5, seed, QUOTES));
      for (const q of QUOTES) {
        const loc = locateQuote(out, q, 0.7);
        expect(loc, `${seed}: ${q}`).not.toBeNull();
        expect(loc!.text).not.toMatch(/\[(inaudible|crosstalk)\]/);
      }
    }
  });

  it('level 4 output looks like raw ASR', () => {
    const out = render(corruptTurns(TURNS, 4, 'asr'));
    const lowerShare = out.split('\n').filter((l) => l.split(': ')[1] === l.split(': ')[1]?.toLowerCase()).length / TURNS.length;
    expect(lowerShare).toBeGreaterThan(0.5);
  });
});

describe('applyHomophones', () => {
  it('mishears product and competitor names when forced', () => {
    const out = applyHomophones('Invoca, CallRail, PreSense and Signal AI', createRng('h'), 1);
    expect(out).not.toMatch(/Invoca|CallRail|PreSense|Signal AI/);
    expect(normalize(out).length).toBeGreaterThan(10);
  });
  it('is a no-op at p=0', () => {
    expect(applyHomophones('Invoca and CallRail', createRng('h'), 0)).toBe('Invoca and CallRail');
  });
});

describe('corruptShorthand', () => {
  it('is deterministic and only applies at level 5', () => {
    const t = 'Nate says the PreSense pop is still blank because of the transfer between queues. Please send the call IDs tomorrow.';
    expect(corruptShorthand(t, 4, 's')).toBe(t);
    expect(corruptShorthand(t, 5, 's')).toBe(corruptShorthand(t, 5, 's'));
  });
});

describe('timeline', () => {
  it('is monotonic for tidy levels and deterministic', () => {
    const tl = timeline(TURNS, 2, 'x');
    for (let i = 1; i < tl.length; i++) expect(tl[i]!.start).toBeGreaterThan(tl[i - 1]!.start);
    expect(timeline(TURNS, 4, 'y')).toEqual(timeline(TURNS, 4, 'y'));
  });
});
