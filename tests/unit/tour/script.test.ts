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

describe('constant chapters', () => {
  it('is 25:00 in total', () => {
    expect(TOTAL_TARGET_SEC).toBe(1500);
  });

  it('numbers every chapter in one sequence, in order, and groups each exactly once', () => {
    CHAPTERS.forEach((c, i) => expect(c.part).toBe(i + 1));
    const grouped = GROUPS.flatMap((g) => g.ids);
    expect(grouped).toEqual(CHAPTERS.map((c) => c.id));
    expect(chapterLabel('ch3')).toBe(`Chapter 10 of ${CHAPTERS.length}`);
  });

  it('puts "What’s real" right after the cold open, and the option choice before the jobs', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(ids.indexOf('real')).toBe(ids.indexOf('cold-open') + 1);
    expect(ids.indexOf('why')).toBeLessThan(ids.indexOf('jtbd'));
  });

  it('every chapter has speaker notes whose time matches its target', () => {
    for (const c of CHAPTERS) expect(NOTES[c.id]?.time, c.id).toBe(fmtTarget(c.targetSec));
  });

  it('every scene step has a registered scene with the same beats it declares', () => {
    for (const s of STEPS.filter((x) => x.kind === 'scene')) {
      expect(SCENES[s.scene!], s.id).toBeDefined();
      expect(s.beats ?? 1).toBeGreaterThanOrEqual(1);
    }
    expect(STEP_BY_ID['why']?.beats).toBe(2);
  });
});

describe('shorter product chapters', () => {
  it('keeps the main path to about 20 product steps', () => {
    const product = MAIN_ORDER.filter((id) => STEP_BY_ID[id]?.kind === 'product');
    expect(product.length).toBeGreaterThanOrEqual(18);
    expect(product.length).toBeLessThanOrEqual(23);
  });

  it('each product chapter has two to five steps', () => {
    for (const c of CHAPTERS.filter((x) => x.layer === 'product')) {
      const n = chapterSteps(c.id).length;
      expect(n, c.id).toBeGreaterThanOrEqual(2);
      expect(n, c.id).toBeLessThanOrEqual(5);
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
    expect(at('ch2.intro', 'privacy')).toBe('ch2.privacy');
    expect(at('ch2.intro', 'main')).toBe('ch2.screen');
    expect(at('ch2.ground', 'messy')).toBe('ch2.messy');
    expect(at('ch2.timing', 'clean')).toBe('ch2.clean');
    expect(at('ch2.screen', 'negative')).toBe('ch2.timing');
  });

  it('a step that needs an open dialog resumes where it can be picked up', () => {
    expect(STEP_BY_ID['ch1.pick']?.resumeAt).toBe('ch1.intro');
  });

  it('step bodies say why in 20 words or fewer, without arrows', () => {
    for (const s of STEPS.filter((x) => x.kind === 'product')) {
      const body = typeof s.body === 'function' ? s.body(ctx()) : s.body;
      expect(body.split(/\s+/).length, s.id).toBeLessThanOrEqual(22);
      expect(body, s.id).not.toMatch(/→/);
    }
  });
});
