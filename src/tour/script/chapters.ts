import type { Chapter, ChapterId } from '../engine/types';

/**
 * The parts of the talk, in order. targetSec sums to 25:00 (1,500 s). Adding "The platform"
 * (60 s) took 15 s each from jobs to be done, today and tomorrow, rollout and the horizon.
 */
export const CHAPTERS: Chapter[] = [
  { id: 'cold-open', part: 0, title: 'Cold open', layer: 'narrative', objective: 'Set the frame', targetSec: 30 },
  { id: 'black-hole', part: 1, title: 'Where feedback gets lost', layer: 'narrative', objective: 'See where feedback goes today', targetSec: 75 },
  { id: 'why', part: 2, title: 'Why this option', layer: 'narrative', objective: 'Mirror Invoca back onto itself', targetSec: 35 },
  { id: 'jtbd', part: 3, title: 'Jobs to be done', layer: 'narrative', objective: 'Flip each card: who needs what', targetSec: 120 },
  { id: 'states', part: 4, title: 'Today and tomorrow', layer: 'narrative', objective: 'Find the leaks, then seal them', targetSec: 115 },
  { id: 'platform', part: 5, title: 'The platform', layer: 'narrative', objective: 'See where Signal Loop runs', targetSec: 60 },
  { id: 'ch1', part: 6, title: 'A call comes in', layer: 'product', productIndex: 1, objective: "Bring in today's call", targetSec: 90 },
  { id: 'ch2', part: 7, title: 'Watch it think', layer: 'product', productIndex: 2, objective: 'Find what it refused to say', targetSec: 135 },
  { id: 'ch3', part: 8, title: 'Human in the loop', layer: 'product', productIndex: 3, objective: 'Approve one, correct one', targetSec: 120 },
  { id: 'ch4', part: 9, title: 'Right owner, right channel', layer: 'product', productIndex: 4, objective: 'Change who hears about pricing', targetSec: 80 },
  { id: 'ch5', part: 10, title: 'Patterns, not anecdotes', layer: 'product', productIndex: 5, objective: 'See the insight join a theme', targetSec: 75 },
  { id: 'ch6', part: 11, title: 'Close the loop', layer: 'product', productIndex: 6, objective: 'Ship it and tell the CSM', targetSec: 50 },
  { id: 'ch7', part: 12, title: 'Prove it', layer: 'product', productIndex: 7, objective: 'Try to promote the candidate prompt', targetSec: 95 },
  { id: 'ch8', part: 13, title: 'Operate it', layer: 'product', productIndex: 8, objective: 'Find your own run in the logs', targetSec: 120 },
  { id: 'rollout', part: 14, title: 'Earning trust: rollout', layer: 'narrative', objective: 'Build it, then operate it', targetSec: 135 },
  { id: 'horizon', part: 15, title: 'The next 12–18 months', layer: 'narrative', objective: 'Where this goes', targetSec: 75 },
  { id: 'production', part: 16, title: 'From proof of concept to production', layer: 'narrative', objective: 'Same design, production stack', targetSec: 45 },
  { id: 'scorecard', part: 17, title: 'Scorecard', layer: 'both', objective: 'What you did, what it did', targetSec: 45 },
];
export const PRODUCT_CHAPTERS = CHAPTERS.filter((c) => c.layer === 'product').length;

export const chapterById = (id: ChapterId): Chapter => {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown chapter ${id}`);
  return c;
};

export const TOTAL_TARGET_SEC = CHAPTERS.reduce((a, c) => a + c.targetSec, 0);

/** Seconds of target time before this chapter starts. */
export const targetOffsetSec = (id: ChapterId): number => {
  let t = 0;
  for (const c of CHAPTERS) {
    if (c.id === id) return t;
    t += c.targetSec;
  }
  return t;
};

export const GROUPS: { label: string; ids: ChapterId[] }[] = [
  { label: 'The problem', ids: ['cold-open', 'black-hole', 'why', 'jtbd', 'states'] },
  { label: 'The system', ids: ['platform', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8'] },
  { label: 'Making it real', ids: ['rollout', 'horizon', 'production', 'scorecard'] },
];

export const BACKUPS: { topic: string; title: string; blurb: string }[] = [
  { topic: 'cost', title: 'Cost model', blurb: 'Per call, per 1k calls, and the $15 viewer cap' },
  { topic: 'security', title: 'Security & PII', blurb: 'Redaction, injection, data boundaries' },
  { topic: 'failure', title: 'Failure handling', blurb: 'Retry, fall back, park it for a person, replay' },
  { topic: 'build-vs-buy', title: 'Build vs buy', blurb: 'Gong, Productboard, Enterpret, Signal AI' },
  { topic: 'metrics', title: 'Success metrics', blurb: 'What I would report, weekly' },
  { topic: 'agent-ops', title: 'Agent Ops', blurb: 'Operating every agent: registry, standard, usage, logs' },
  { topic: 'differently', title: "What I'd do differently", blurb: 'Honest limits of this build' },
];
