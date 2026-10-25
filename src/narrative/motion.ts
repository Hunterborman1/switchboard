/**
 * Narrative motion tokens (docs/DESIGN.md). Animation only shows a change of state or a
 * progression: 120 ms press, 180 ms enter/exit, 240 ms layout, data reveals up to 600 ms.
 * Opacity and short translate only; no blur, bounce or loops. Every consumer checks useCalm().
 */
import type { Transition, Variants } from 'motion/react';

export const EASE = [0.2, 0, 0, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

export const DUR = {
  press: 0.12,
  ui: 0.18,
  layout: 0.24,
  data: 0.6,
} as const;

/** Sequential reveals: one item every 120 ms at most. */
export const STAGGER = 0.06;

export const enter: Transition = { duration: DUR.ui, ease: EASE };
export const layout: Transition = { duration: DUR.layout, ease: EASE };
export const data: Transition = { duration: DUR.data, ease: EASE };

/** Enter: fade up 6px. */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.layout, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DUR.ui, ease: EASE_EXIT } },
};

export const revealReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export const stagger = (delay = 0, each = STAGGER): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren: delay } },
  exit: { transition: { staggerChildren: 0 } },
});

/** Helper: a timed transition that collapses to an instant one under reduced motion. */
export const tr = (calm: boolean, duration: number = DUR.layout, delay = 0): Transition => (calm ? { duration: 0 } : { duration, ease: EASE, delay });
