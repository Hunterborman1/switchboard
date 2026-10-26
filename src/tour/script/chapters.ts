import type { Chapter, ChapterId } from '../engine/types';

/**
 * The ten chapters of the presentation, in order and numbered 1–10, so the rail, the Guide's
 * chapter picker and the presenter view all say the same thing: three to set up the problem and
 * the choice, five in the real product (the first opens on the platform scene), two to close.
 * targetSec sums to 25:00 (1,500 s).
 */
export const CHAPTERS: Chapter[] = [
  { id: 'signal', part: 1, title: 'Every call is a signal', layer: 'narrative', objective: 'One sentence that belongs on the roadmap, and where it gets lost', targetSec: 150 },
  { id: 'real', part: 2, title: 'Built in 48 hours: what’s real', layer: 'narrative', objective: 'Built and working, or simulated, and why', targetSec: 90 },
  { id: 'why', part: 3, title: 'Why this option', layer: 'narrative', objective: 'The choice, and how it was built', targetSec: 120 },
  { id: 'call', part: 4, title: 'A call comes in', layer: 'both', objective: 'See the platform, bring in a call and watch it run', targetSec: 270 },
  { id: 'review', part: 5, title: 'Human in the loop', layer: 'product', objective: 'Approve one, correct one', targetSec: 105 },
  { id: 'routing', part: 6, title: 'Right owner, right channel', layer: 'product', objective: 'Change who hears about pricing', targetSec: 105 },
  { id: 'patterns', part: 7, title: 'Patterns, and closing the loop', layer: 'product', objective: 'One complaint becomes a pattern; ship it and tell the CSM', targetSec: 120 },
  { id: 'operate', part: 8, title: 'Prove it, then operate it', layer: 'product', objective: 'Try to promote a worse prompt; find your run in Agent Ops', targetSec: 195 },
  { id: 'production', part: 9, title: 'Making it real', layer: 'narrative', objective: 'Roll it out, grow it, run it in production', targetSec: 270 },
  { id: 'scorecard', part: 10, title: 'Scorecard', layer: 'both', objective: 'What you did, what it did', targetSec: 75 },
];

export const chapterById = (id: ChapterId): Chapter => {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown chapter ${id}`);
  return c;
};

export const TOTAL_TARGET_SEC = CHAPTERS.reduce((a, c) => a + c.targetSec, 0);

/** "Chapter 5 of 10": the one numbering every surface uses. */
export const chapterLabel = (id: ChapterId): string => `Chapter ${chapterById(id).part} of ${CHAPTERS.length}`;

/** Seconds of target time before this chapter starts. */
export const targetOffsetSec = (id: ChapterId): number => {
  let t = 0;
  for (const c of CHAPTERS) {
    if (c.id === id) return t;
    t += c.targetSec;
  }
  return t;
};

/** "1:30" for a target in seconds. */
export const fmtTarget = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export const GROUPS: { label: string; ids: ChapterId[] }[] = [
  { label: 'Introduction', ids: ['signal', 'real', 'why'] },
  { label: 'The platform', ids: ['call', 'review', 'routing', 'patterns', 'operate'] },
  { label: 'Closing', ids: ['production', 'scorecard'] },
];

export const groupOf = (id: ChapterId): string => GROUPS.find((g) => g.ids.includes(id))?.label ?? '';

export const BACKUPS: { topic: string; title: string; blurb: string }[] = [
  { topic: 'cost', title: 'Cost model', blurb: 'Per call, per 1k calls, and the $15 viewer cap' },
  { topic: 'security', title: 'Security & PII', blurb: 'Redaction, injection, data boundaries' },
  { topic: 'failure', title: 'Failure handling', blurb: 'Retry, fall back, park it for a person, replay' },
  { topic: 'build-vs-buy', title: 'Build vs buy', blurb: 'Gong, Productboard, Enterpret, Signal AI' },
  { topic: 'metrics', title: 'Success metrics', blurb: 'What I would report, weekly' },
  { topic: 'agent-ops', title: 'Agent Ops', blurb: 'Operating every agent: registry, standard, usage, logs' },
  { topic: 'differently', title: "What I'd do differently", blurb: 'Honest limits of this build' },
];
