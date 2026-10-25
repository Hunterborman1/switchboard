import { describe, expect, it } from 'vitest';
import { floatPosition, MIN_W, planPlacement, SIDE_MIN_W } from '../../../src/tour/engine/placement';

const VW = 1440;
const VH = 900;
const RAIL = 271; // product rail: the callout never floats over it

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('tour callout placement', () => {
  it('keeps the preferred side when it has room', () => {
    const box = { x: 900, y: 300, w: 200, h: 60 };
    expect(planPlacement(box, 'left', 260, VW, VH, RAIL)?.side).toBe('left');
  });

  it('falls back to below for a full-width row (the ch4 pricing rule)', () => {
    const row = { x: 296, y: 360, w: 1128, h: 90 };
    const p = planPlacement(row, 'left', 260, VW, VH, RAIL);
    expect(p?.side).toBe('bottom');
    expect(p!.width).toBeGreaterThanOrEqual(288);
  });

  it('goes above when below has no room', () => {
    const row = { x: 296, y: 640, w: 1128, h: 90 };
    expect(planPlacement(row, 'bottom', 260, VW, VH, RAIL)?.side).toBe('top');
  });

  it('floats when no side fits (full-width, tall panel), never over the rail', () => {
    const panel = { x: 296, y: 80, w: 1128, h: 760 };
    expect(planPlacement(panel, 'left', 260, VW, VH, RAIL)).toBeNull();
    const pos = floatPosition(panel, 380, 260, VW, VH, RAIL);
    expect(pos.left).toBeGreaterThanOrEqual(RAIL);
    expect(pos.top + 260).toBeLessThanOrEqual(VH);
  });

  it('picks the corner that covers the target least', () => {
    // target in the bottom-left of the content area → the card should not sit there
    const target = { x: 300, y: 500, w: 500, h: 380 };
    const pos = floatPosition(target, 380, 260, VW, VH, RAIL);
    expect(overlaps({ x: pos.left, y: pos.top, w: 380, h: 260 }, target)).toBe(false);
  });

  it('docks beside a large dialog when the gutter is wide enough', () => {
    const dialog = { x: 328, y: 112, w: 1056, h: 680 };
    // Dialog gutters may use the narrower card (TourOverlay passes MIN_W for dialog targets).
    const p = planPlacement(dialog, 'right', 300, VW, VH, 0, MIN_W);
    expect(p?.side).toBe('left');
    expect(p!.width).toBeLessThanOrEqual(328);
  });

  it('rejects a side gap narrower than the card (ch4.jira: 298 px between list and preview)', () => {
    // Preview panel at x=604 with the rail at 271: 317 px of room on the left, card would be 298 px.
    const preview = { x: 604, y: 56, w: 820, h: 790 };
    expect(planPlacement(preview, 'left', 220, VW, VH, RAIL)).toBeNull();
    // With room for the minimum card it docks beside.
    const roomy = { x: RAIL + 16 + SIDE_MIN_W + 18, y: 56, w: 600, h: 790 };
    const p = planPlacement(roomy, 'left', 220, VW, VH, RAIL);
    expect(p?.side).toBe('left');
    expect(p!.width).toBeGreaterThanOrEqual(SIDE_MIN_W);
  });

  it('honours the preferred float corner (ch4.sankey keeps off the bottom-left node)', () => {
    const panel = { x: 296, y: 140, w: 1128, h: 620 };
    const pos = floatPosition(panel, 380, 220, VW, VH, RAIL, 'top-left');
    expect(pos.left).toBe(RAIL + 16);
    expect(pos.top).toBeLessThan(140);
  });
});
