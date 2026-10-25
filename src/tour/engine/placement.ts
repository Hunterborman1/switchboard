/**
 * Callout placement maths for the tour overlay (pure, unit-tested in tests/unit/tour).
 * The callout never sits on top of the thing it points at: preferred side, then below,
 * above, right, left; if none has room, a corner of the content area that covers least.
 */
import type { Placement } from '@floating-ui/react';
import type { Box } from './useAnchor';

export type Side = 'top' | 'bottom' | 'left' | 'right';

export const GAP = 18; // callout ↔ target
export const MARGIN = 16; // callout ↔ viewport edge
export const MIN_W = 288;
/**
 * A side placement needs this much width or the card's footer (Back · hint · Continue) clips.
 * Dialog targets (the file picker) keep the narrower MIN_W: their gutter is all there is.
 */
export const SIDE_MIN_W = 340;
export const MAX_W = 380;
export const HEADER = 72; // product top bar: keep targets and floating cards below it
export const PILL_CLEAR = 64; // room for the HUD pill bottom-right

export const sideOf = (p: Placement | undefined): Side => (p ? (p.split('-')[0] as Side) : 'bottom');

/** First side with room for the whole callout, or null (float). Exported for unit tests. */
export function planPlacement(box: Box, pref: Side, cardH: number, vw: number, vh: number, safeLeft: number, minSideW = SIDE_MIN_W): { side: Side; width: number } | null {
  const space = {
    top: box.y - Math.max(MARGIN, HEADER * 0.5),
    bottom: vh - (box.y + box.h) - PILL_CLEAR, // keep the bottom strip clear for the HUD pill
    left: box.x - safeLeft - MARGIN,
    right: vw - (box.x + box.w) - MARGIN,
  };
  const order = [pref, 'bottom', 'top', 'right', 'left'].filter((s, i, a) => a.indexOf(s) === i) as Side[];
  const fullW = Math.min(MAX_W, vw - safeLeft - MARGIN * 2);
  for (const s of order) {
    if (s === 'top' || s === 'bottom') {
      if (space[s] >= cardH + GAP) return { side: s, width: fullW };
    } else if (space[s] >= minSideW + GAP) {
      return { side: s, width: Math.min(MAX_W, space[s] - GAP) };
    }
  }
  return null;
}

/** Corner of the content area that overlaps the target least. Exported for unit tests. */
export function floatPosition(
  box: Box | null,
  w: number,
  h: number,
  vw: number,
  vh: number,
  safeLeft: number,
  prefer?: 'bottom-left' | 'bottom-right' | 'top-right' | 'top-left',
): { left: number; top: number } {
  const bottomTop = Math.max(HEADER, vh - MARGIN - h);
  const named = {
    'bottom-left': { left: safeLeft + MARGIN, top: bottomTop },
    'bottom-right': { left: vw - MARGIN - w, top: Math.max(HEADER, vh - PILL_CLEAR - h) },
    'top-right': { left: vw - MARGIN - w, top: HEADER + MARGIN },
    'top-left': { left: safeLeft + MARGIN, top: HEADER + MARGIN },
  };
  // A step that knows where its content is (e.g. a node it talks about) names the corner to use.
  if (prefer) return named[prefer];
  const cands = [named['bottom-left'], named['bottom-right'], named['top-right'], named['top-left']];
  if (!box) return cands[0]!;
  const overlap = (c: { left: number; top: number }) => {
    const ix = Math.max(0, Math.min(c.left + w, box.x + box.w) - Math.max(c.left, box.x));
    const iy = Math.max(0, Math.min(c.top + h, box.y + box.h) - Math.max(c.top, box.y));
    return ix * iy;
  };
  let best = cands[0]!;
  let bestO = overlap(best);
  for (const c of cands.slice(1)) {
    const o = overlap(c);
    if (o < bestO - 400) {
      best = c;
      bestO = o;
    }
  }
  return best;
}

