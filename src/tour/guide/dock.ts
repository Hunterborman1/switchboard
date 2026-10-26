/**
 * Where the Guide sits and what it leaves free (pure, unit-tested in tests/unit/tour/dock.test.ts).
 *
 * The Guide is docked, never floating: on desktop a bar along the bottom of the content column,
 * on phones a bottom sheet. The page reserves its height (padding, and dialogs, drawers, toasts
 * and sticky bars sit above it), so it covers nothing; a target only has to be scrolled into the
 * band between the top bar and the dock.
 */

export type Rect = { x: number; y: number; w: number; h: number };
/** vw/vh: the viewport. top: bottom edge of the product's top bar. left: left edge of the content column. */
export type Viewport = { vw: number; vh: number; top: number; left: number };

/** Clear space kept between a target and the top bar or the dock. */
export const GAP = 8;

/** The visible band of the page above a dock `dockH` tall. */
export function dockBand(vp: Viewport, dockH: number): { top: number; bottom: number } {
  return { top: vp.top + GAP, bottom: vp.vh - dockH - GAP };
}

/** Pixels to scroll (positive: down) so the target sits inside the band; 0 when it already does. */
export function scrollDelta(target: Rect, band: { top: number; bottom: number }): number {
  if (target.y >= band.top && target.y + target.h <= band.bottom) return 0;
  if (target.h > band.bottom - band.top || target.y < band.top) return target.y - band.top;
  return target.y + target.h - band.bottom;
}

/** Phones: the band above the open sheet, and whether the sheet must fold to its bar to show the target. */
export function sheetPlan(target: Rect | null, sheetH: number, vp: Viewport): { band: { top: number; bottom: number }; fold: boolean } {
  const band = dockBand(vp, sheetH);
  if (!target) return { band, fold: false };
  // Taller than the room above the open sheet: fold it to its bar and give the page the screen.
  return { band, fold: target.h > band.bottom - band.top };
}
