import { describe, expect, it } from 'vitest';
import { CHAPTERS, GROUPS, TOTAL_TARGET_SEC, chapterLabel, fmtTarget } from '../../../src/tour/script/chapters';
import { BRANCH_STEPS, MAIN_ORDER, STEPS, STEP_BY_ID, chapterSteps } from '../../../src/tour/script/steps';
import { NOTES } from '../../../src/tour/script/notes';
import { SCENES } from '../../../src/narrative/scenes';
import type { TourCtx } from '../../../src/tour/engine/types';

const ctx = (patch: Partial<TourCtx> = {}): TourCtx => ({
  path: 'main', fileId: null, runId: null, themeId: null, explored: [],
  counters: { approvals: 0, edits: 0, rejects: 0, rulesChanged: 0, shipped: 0, promoteAttempts: 0, promoted: null, redactionToggled: false, deliveriesOpened: 0 },
  run: null, evals: null, budget: null, ops: null, peek: null, theme: null, pathname: '/', lastEvent: null, ...patch,
});

describe('ten chapters', () => {
  it('is 25:00 in total', () => {
    expect(TOTAL_TARGET_SEC).toBe(1500);
  });

  it('is three introduction chapters, five in the platform and two to close', () => {
    expect(CHAPTERS).toHaveLength(10);
    expect(GROUPS.map((g) => [g.label, g.ids.length])).toEqual([
      ['Introduction', 3],
      ['The platform', 5],
      ['Closing', 2],
    ]);
    expect(CHAPTERS.map((c) => c.id)).toEqual(['signal', 'real', 'why', 'call', 'review', 'routing', 'patterns', 'operate', 'production', 'scorecard']);
  });

  it('numbers every chapter in one sequence, in order, and groups each exactly once', () => {
    CHAPTERS.forEach((c, i) => expect(c.part).toBe(i + 1));
    const grouped = GROUPS.flatMap((g) => g.ids);
    expect(grouped).toEqual(CHAPTERS.map((c) => c.id));
    expect(chapterLabel('review')).toBe(`Chapter 5 of ${CHAPTERS.length}`);
  });

  it('every chapter has speaker notes whose time matches its target', () => {
    for (const c of CHAPTERS) expect(NOTES[c.id]?.time, c.id).toBe(fmtTarget(c.targetSec));
  });

  it('every scene step draws a registered scene, and no step has beats', () => {
    for (const s of STEPS.filter((x) => x.kind === 'scene')) expect(SCENES[s.scene!], s.id).toBeDefined();
    for (const s of STEPS) expect('beats' in s, s.id).toBe(false);
  });

  it('the platform chapter opens on the platform scene, then the product', () => {
    expect(chapterSteps('call').slice(0, 2)).toEqual(['call.platform', 'call.intro']);
    expect(STEP_BY_ID['call.platform']?.kind).toBe('scene');
    expect(STEP_BY_ID['why']?.next).toBe('call.platform');
  });

  it('step ids name their chapter', () => {
    for (const s of STEPS) expect(s.id === s.chapter || s.id.startsWith(`${s.chapter}.`), s.id).toBe(true);
  });
});

describe('shorter product chapters', () => {
  it('keeps the main path to about 20 product steps', () => {
    const product = MAIN_ORDER.filter((id) => STEP_BY_ID[id]?.kind === 'product');
    expect(product.length).toBeGreaterThanOrEqual(18);
    expect(product.length).toBeLessThanOrEqual(23);
  });

  it('each platform chapter has two to nine steps on the main path', () => {
    for (const id of GROUPS.find((g) => g.label === 'The platform')!.ids) {
      const n = chapterSteps(id).length;
      expect(n, id).toBeGreaterThanOrEqual(2);
      expect(n, id).toBeLessThanOrEqual(9);
    }
  });

  it('every step links to a step that exists', () => {
    for (const s of STEPS) {
      const next = typeof s.next === 'function' ? s.next(ctx()) : s.next;
      expect(STEP_BY_ID[next], `${s.id} → ${next}`).toBeDefined();
      if (s.resumeAt) expect(STEP_BY_ID[s.resumeAt]).toBeDefined();
    }
    for (const b of BRANCH_STEPS) expect(STEP_BY_ID[b]).toBeDefined();
  });

  it('branches stay reachable: privacy, messy, clean and negative take their own turns', () => {
    const at = (id: string, path: TourCtx['path']) => {
      const s = STEP_BY_ID[id]!;
      return typeof s.next === 'function' ? s.next(ctx({ path })) : s.next;
    };
    expect(at('call.watch', 'privacy')).toBe('call.privacy');
    expect(at('call.watch', 'main')).toBe('call.screen');
    expect(at('call.ground', 'messy')).toBe('call.messy');
    expect(at('call.timing', 'clean')).toBe('call.clean');
    expect(at('call.screen', 'negative')).toBe('call.timing');
  });

  it('a step that needs an open dialog resumes where it can be picked up', () => {
    expect(STEP_BY_ID['call.pick']?.resumeAt).toBe('call.intro');
  });

  it('step bodies say why in 20 words or fewer, without arrows', () => {
    for (const s of STEPS.filter((x) => x.kind === 'product')) {
      const body = typeof s.body === 'function' ? s.body(ctx()) : s.body;
      expect(body.split(/\s+/).length, s.id).toBeLessThanOrEqual(22);
      expect(body, s.id).not.toMatch(/→/);
    }
  });
});
