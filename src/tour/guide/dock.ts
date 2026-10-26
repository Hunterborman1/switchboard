/**
 * Where the Guide sits (pure, unit-tested in tests/unit/tour/dock.test.ts).
 *
 * The Guide is a fixed panel in a corner of the product's content area (never over the left
 * sidebar). It must never cover the element it points at, nor an open product dialog or drawer.
 * First the page scrolls the target into a band the Guide leaves free; then the first corner that
 * covers nothing wins (narrowing to MIN_W if that clears it), then the same corners at the compact
 * size (title and why), then a one-line bar, then the small pill.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Dock = 'br' | 'bl' | 'tr';
export type GuideSize = 'full' | 'compact' | 'bar' | 'min';
/** vw/vh: the viewport. top: bottom edge of the product's top bar. left: left edge of the content column. */
export type Viewport = { vw: number; vh: number; top: number; left: number };

export const GUIDE_W = 380;
/** The narrowest the Guide gets to clear something beside it. */
export const MIN_W = 340;
const WIDTHS = [GUIDE_W, MIN_W];
/** Compact: the step's title and why, no header or footer. */
export const COMPACT_H = 112;
/** Bar: one line (what to do) and the primary action. */
export const BAR_H = 60;
export const PILL = { w: 96, h: 32 };
export const MARGIN = 16;
/** Clear space between the Guide and what it must not cover. */
export const GAP = 12;
export const DOCKS: Dock[] = ['br', 'bl', 'tr'];

export function guideRect(dock: Dock, w: number, h: number, vp: Viewport): Rect {
  const width = Math.min(w, vp.vw - vp.left - MARGIN * 2);
  if (dock === 'bl') return { x: vp.left + MARGIN, y: vp.vh - MARGIN - h, w: width, h };
  if (dock === 'tr') return { x: vp.vw - MARGIN - width, y: vp.top + MARGIN, w: width, h };
  return { x: vp.vw - MARGIN - width, y: vp.vh - MARGIN - h, w: width, h };
}

export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** The vertical band a target must sit in for a Guide at `g` to leave it uncovered. */
export function freeBand(target: Rect, g: Rect, vp: Viewport): { top: number; bottom: number } {
  const clearSideways = target.x + target.w + GAP <= g.x || target.x >= g.x + g.w + GAP;
  const top = vp.top + 8;
  const bottom = vp.vh - 8;
  if (clearSideways) return { top, bottom };
  const guideBelow = g.y + g.h / 2 > vp.vh / 2;
  return guideBelow ? { top, bottom: g.y - GAP } : { top: g.y + g.h + GAP, bottom };
}

/**
 * What to scroll for: the first corner and size (full, then compact, then the bar) whose free band
 * can hold the whole target. A target too tall for any of them is parked just below a compact
 * Guide at the top right, so the Guide sits above it and the target runs on down the page.
 */
export function bandFor(
  target: Rect,
  fullH: number,
  vp: Viewport,
  obstacles: Rect[] = [],
): { dock: Dock; size: Exclude<GuideSize, 'min'>; band: { top: number; bottom: number }; tall?: boolean } {
  for (const size of ['full', 'compact', 'bar'] as const) {
    const h = size === 'full' ? fullH : size === 'compact' ? Math.min(fullH, COMPACT_H) : BAR_H;
    for (const d of DOCKS) {
      for (const w of WIDTHS) {
        const g = guideRect(d, w, h, vp);
        if (obstacles.some((o) => overlaps(g, o, 8))) continue;
        const band = freeBand(target, g, vp);
        if (band.bottom - band.top >= target.h) return { dock: d, size, band };
      }
    }
  }
  return { dock: 'tr', size: 'compact', band: { top: vp.top + MARGIN + COMPACT_H + GAP + 8, bottom: vp.vh - 8 }, tall: true };
}

/** Pixels to scroll (positive: down) so the target sits inside the band; 0 when it already does. */
export function scrollDelta(target: Rect, band: { top: number; bottom: number }): number {
  if (target.y >= band.top && target.y + target.h <= band.bottom) return 0;
  if (target.h > band.bottom - band.top || target.y < band.top) return target.y - band.top;
  return target.y + target.h - band.bottom;
}

/**
 * Where the Guide goes now, without scrolling: the first corner at full size that covers neither
 * the target nor an obstacle (bottom-right first, narrowed if that clears it), then compact, then
 * the pill.
 */
export function chooseDock(
  target: Rect | null,
  obstacles: Rect[],
  fullH: number,
  vp: Viewport,
): { dock: Dock; size: GuideSize; width: number } {
  const blocked = (g: Rect) => (target ? overlaps(g, target, GAP) : false) || obstacles.some((o) => overlaps(g, o, 8));
  for (const size of ['full', 'compact', 'bar'] as const) {
    const h = size === 'full' ? fullH : size === 'compact' ? Math.min(fullH, COMPACT_H) : BAR_H;
    for (const d of DOCKS) for (const w of WIDTHS) if (!blocked(guideRect(d, w, h, vp))) return { dock: d, size, width: w };
  }
  // Last resort, the pill, in whichever corner it covers nothing (bottom-right if none).
  for (const d of DOCKS) if (!blocked(guideRect(d, PILL.w, PILL.h, vp))) return { dock: d, size: 'min', width: GUIDE_W };
  return { dock: 'br', size: 'min', width: GUIDE_W };
}

/** Phones: the bottom sheet. The band above it, and whether the sheet must fold to its bar. */
export function sheetPlan(target: Rect | null, sheetH: number, barH: number, vp: Viewport): { band: { top: number; bottom: number }; fold: boolean } {
  const band = { top: vp.top + 8, bottom: vp.vh - sheetH - 8 };
  if (!target) return { band, fold: false };
  // Taller than the room above the open sheet: fold it to its bar and give the page the screen.
  return { band, fold: target.h > band.bottom - band.top };
}
