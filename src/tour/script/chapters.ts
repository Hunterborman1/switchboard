import type { Chapter, ChapterId } from '../engine/types';

/**
 * The chapters of the presentation, in order, numbered 1–19 in one sequence (narrative and
 * product alike), so the rail, the Guide's chapter picker and the presenter view all say the same
 * thing. targetSec sums to 25:00 (1,500 s). The product chapters were cut from 43 steps to 22 and
 * from 12:45 to 11:05; the time went to "What's real in this demo" (new) and the two-beat "Why
 * this option, and not the others".
 */
export const CHAPTERS: Chapter[] = [
  { id: 'cold-open', part: 1, title: 'Every call is a signal', layer: 'narrative', objective: 'One sentence that belongs on the roadmap', targetSec: 30 },
  { id: 'real', part: 2, title: 'What’s real in this demo', layer: 'narrative', objective: 'Built and working, or simulated, and why', targetSec: 75 },
  { id: 'black-hole', part: 3, title: 'Where feedback gets lost', layer: 'narrative', objective: 'See where feedback goes today', targetSec: 75 },
  { id: 'why', part: 4, title: 'Why this option, and not the others', layer: 'narrative', objective: 'The choice, and how it was built', targetSec: 90 },
  { id: 'jtbd', part: 5, title: 'Jobs to be done', layer: 'narrative', objective: 'Who needs what, and why', targetSec: 105 },
  { id: 'states', part: 6, title: 'Today and tomorrow', layer: 'narrative', objective: 'Find the leaks, then seal them', targetSec: 100 },
  { id: 'platform', part: 7, title: 'The platform', layer: 'narrative', objective: 'See where Signal Loop runs', targetSec: 60 },
  { id: 'ch1', part: 8, title: 'A call comes in', layer: 'product', productIndex: 1, objective: 'Bring in today’s call', targetSec: 60 },
  { id: 'ch2', part: 9, title: 'Watch it run', layer: 'product', productIndex: 2, objective: 'See what it found, and how fast', targetSec: 135 },
  { id: 'ch3', part: 10, title: 'Human in the loop', layer: 'product', productIndex: 3, objective: 'Approve one, correct one', targetSec: 90 },
  { id: 'ch4', part: 11, title: 'Right owner, right channel', layer: 'product', productIndex: 4, objective: 'Change who hears about pricing', targetSec: 90 },
  { id: 'ch5', part: 12, title: 'Patterns, not anecdotes', layer: 'product', productIndex: 5, objective: 'One complaint becomes a pattern', targetSec: 60 },
  { id: 'ch6', part: 13, title: 'Close the loop', layer: 'product', productIndex: 6, objective: 'Ship it and tell the CSM', targetSec: 50 },
  { id: 'ch7', part: 14, title: 'Prove it', layer: 'product', productIndex: 7, objective: 'Try to promote the candidate prompt', targetSec: 90 },
  { id: 'ch8', part: 15, title: 'Operate it', layer: 'product', productIndex: 8, objective: 'Find your own run in Agent Ops', targetSec: 90 },
  { id: 'rollout', part: 16, title: 'Earning trust: rollout', layer: 'narrative', objective: 'Build it, then operate it', targetSec: 135 },
  { id: 'horizon', part: 17, title: 'The next 12–18 months', layer: 'narrative', objective: 'Where this goes', targetSec: 75 },
  { id: 'production', part: 18, title: 'From proof of concept to production', layer: 'narrative', objective: 'Same design, production stack', targetSec: 45 },
  { id: 'scorecard', part: 19, title: 'Scorecard', layer: 'both', objective: 'What you did, what it did', targetSec: 45 },
];
export const PRODUCT_CHAPTERS = CHAPTERS.filter((c) => c.layer === 'product').length;

export const chapterById = (id: ChapterId): Chapter => {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown chapter ${id}`);
  return c;
};

export const TOTAL_TARGET_SEC = CHAPTERS.reduce((a, c) => a + c.targetSec, 0);

/** "Chapter 10 of 19": the one numbering every surface uses. */
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
  { label: 'Before the build', ids: ['cold-open', 'real', 'black-hole', 'why', 'jtbd', 'states'] },
  { label: 'The system', ids: ['platform', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8'] },
  { label: 'Making it real', ids: ['rollout', 'horizon', 'production', 'scorecard'] },
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
