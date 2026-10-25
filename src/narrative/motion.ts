/**
 * Narrative motion tokens. Story layer is slow and deliberate (500–700 ms); anything that
 * sits on the product layer stays ≤ 400 ms. Every consumer checks `useReducedMotion()`.
 */
import type { Transition, Variants } from 'motion/react';

export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_INOUT = [0.65, 0, 0.35, 1] as const;

export const DUR = {
  fast: 0.16,
  ui: 0.28,
  product: 0.4,
  slow: 0.6,
  slower: 0.7,
} as const;

export const STAGGER = 0.09; // ≤ 120 ms

export const slow: Transition = { duration: DUR.slow, ease: EASE };
export const slower: Transition = { duration: DUR.slower, ease: EASE };
export const product: Transition = { duration: DUR.product, ease: EASE };
export const spring: Transition = { type: 'spring', stiffness: 260, damping: 32, mass: 0.9 };

/** Blur-reveal: the signature narrative entrance. */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(10px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: slow },
  exit: { opacity: 0, y: -8, filter: 'blur(6px)', transition: { duration: DUR.ui, ease: EASE } },
};

export const revealReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export const stagger = (delay = 0, each = STAGGER): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: each, delayChildren: delay } },
  exit: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
});
