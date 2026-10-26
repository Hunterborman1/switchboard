import { describe, expect, it } from 'vitest';
import { bandFor, BAR_H, chooseDock, COMPACT_H, freeBand, GAP, guideRect, MARGIN, overlaps, scrollDelta, sheetPlan, type Rect, type Viewport } from '../../../src/tour/guide/dock';

const desktop: Viewport = { vw: 1440, vh: 900, top: 52, left: 248 };
const tablet: Viewport = { vw: 1024, vh: 768, top: 52, left: 248 };
const phone: Viewport = { vw: 390, vh: 844, top: 52, left: 0 };
const FULL_H = 330;

describe('guide corners', () => {
  it('sits bottom-right by default, and never over the sidebar', () => {
    const br = guideRect('br', 380, FULL_H, desktop);
    expect(br.x + br.w).toBe(desktop.vw - MARGIN);
    expect(br.y + br.h).toBe(desktop.vh - MARGIN);
    const bl = guideRect('bl', 380, FULL_H, desktop);
    expect(bl.x).toBeGreaterThanOrEqual(desktop.left);
  });

  it('a small target away from the corner keeps the Guide bottom-right, full size', () => {
    const target: Rect = { x: 300, y: 120, w: 200, h: 40 };
    expect(chooseDock(target, [], FULL_H, desktop)).toEqual({ dock: 'br', size: 'full', width: 380 });
  });

  it('moves to another corner rather than cover the target', () => {
    const target: Rect = { x: 1100, y: 640, w: 300, h: 60 };
    const c = chooseDock(target, [], FULL_H, desktop);
    expect(c.size).toBe('full');
    expect(c.dock).not.toBe('br');
    expect(overlaps(guideRect(c.dock, 380, FULL_H, desktop), target, GAP)).toBe(false);
  });

  it('folds to compact, then a bar, then the pill when no corner is free', () => {
    // A target that fills the content area below a compact Guide at the top right.
    const tall: Rect = { x: 270, y: desktop.top + MARGIN + COMPACT_H + GAP + 4, w: 1150, h: 900 };
    expect(chooseDock(tall, [], FULL_H, desktop)).toMatchObject({ dock: 'tr', size: 'compact' });
    const fills: Rect = { x: 250, y: 0, w: 1190, h: 900 };
    expect(chooseDock(fills, [], FULL_H, desktop).size).toBe('min');
  });

  it('never covers an open dialog: the file picker leaves room for a bar below it at 1440×900', () => {
    const picker: Rect = { x: 200, y: 110, w: 1040, h: 680 };
    const row: Rect = { x: 420, y: 680, w: 520, h: 64 };
    const c = chooseDock(row, [picker], FULL_H, desktop);
    expect(c.size).toBe('bar');
    expect(overlaps(guideRect(c.dock, 380, BAR_H, desktop), picker, 8)).toBe(false);
  });
});

describe('sticky action bars', () => {
  it('narrows to clear a decision bar beside the list rather than cover the page', () => {
    // The review's sticky decision bar fills the detail column's bottom edge at 1440×900.
    const bar: Rect = { x: 641, y: 828, w: 767, h: 58 };
    const approve: Rect = { x: 655, y: 836, w: 206, h: 44 };
    const c = chooseDock(approve, [bar], FULL_H, desktop);
    expect(c).toEqual({ dock: 'bl', size: 'full', width: 340 });
    expect(overlaps(guideRect('bl', c.width, FULL_H, desktop), bar, 8)).toBe(false);
  });
});

describe('scrolling the target clear of the Guide', () => {
  it('the band above a bottom Guide, when the target is in its column', () => {
    const g = guideRect('br', 380, FULL_H, desktop);
    const target: Rect = { x: 1100, y: 700, w: 200, h: 44 };
    const band = freeBand(target, g, desktop);
    expect(band.bottom).toBe(g.y - GAP);
    expect(scrollDelta(target, band)).toBe(target.y + target.h - band.bottom);
  });

  it('no scroll when the target is beside the Guide', () => {
    const target: Rect = { x: 300, y: 700, w: 200, h: 44 };
    const g = guideRect('br', 380, FULL_H, desktop);
    const band = freeBand(target, g, desktop);
    expect(scrollDelta(target, band)).toBe(0);
  });

  it('a target taller than any band parks under a compact Guide at the top', () => {
    const tall: Rect = { x: 270, y: 300, w: 740, h: 1400 };
    const b = bandFor(tall, FULL_H, tablet);
    expect(b.tall).toBe(true);
    expect(b.dock).toBe('tr');
    expect(b.band.top).toBeGreaterThan(tablet.top + COMPACT_H);
  });

  it('phones: the band is above the open sheet, and a tall target folds it', () => {
    const small: Rect = { x: 16, y: 600, w: 358, h: 44 };
    const p = sheetPlan(small, 340, 52, phone);
    expect(p.band.bottom).toBe(phone.vh - 340 - 8);
    expect(p.fold).toBe(false);
    const tall: Rect = { x: 16, y: 120, w: 358, h: 700 };
    expect(sheetPlan(tall, 340, 52, phone).fold).toBe(true);
  });
});
