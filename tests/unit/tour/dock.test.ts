import { describe, expect, it } from 'vitest';
import { dockBand, GAP, scrollDelta, sheetPlan, type Rect, type Viewport } from '../../../src/tour/guide/dock';

const desktop: Viewport = { vw: 1440, vh: 900, top: 52, left: 248 };
const phone: Viewport = { vw: 390, vh: 844, top: 52, left: 0 };
const DOCK_H = 120;

describe('the band the dock leaves free', () => {
  it('runs from under the top bar to above the dock', () => {
    expect(dockBand(desktop, DOCK_H)).toEqual({ top: desktop.top + GAP, bottom: desktop.vh - DOCK_H - GAP });
  });

  it('a target already in the band needs no scroll', () => {
    const target: Rect = { x: 300, y: 300, w: 200, h: 40 };
    expect(scrollDelta(target, dockBand(desktop, DOCK_H))).toBe(0);
  });

  it('a target under the dock scrolls up just enough to clear it', () => {
    const band = dockBand(desktop, DOCK_H);
    const target: Rect = { x: 300, y: 820, w: 200, h: 44 };
    expect(scrollDelta(target, band)).toBe(target.y + target.h - band.bottom);
  });

  it('a target above the top bar scrolls down to sit under it', () => {
    const band = dockBand(desktop, DOCK_H);
    const target: Rect = { x: 300, y: -200, w: 200, h: 44 };
    expect(scrollDelta(target, band)).toBe(target.y - band.top);
  });

  it('a target taller than the band starts at its top', () => {
    const band = dockBand(desktop, DOCK_H);
    const target: Rect = { x: 300, y: 400, w: 800, h: 1200 };
    expect(scrollDelta(target, band)).toBe(target.y - band.top);
  });
});

describe('the phone sheet', () => {
  it('stays open when the target fits above it', () => {
    const target: Rect = { x: 16, y: 200, w: 300, h: 120 };
    expect(sheetPlan(target, 320, phone).fold).toBe(false);
  });

  it('folds to its bar when the target is taller than the room above it', () => {
    const target: Rect = { x: 16, y: 120, w: 358, h: 560 };
    expect(sheetPlan(target, 320, phone).fold).toBe(true);
  });

  it('with no target, the band is the same as the dock band', () => {
    expect(sheetPlan(null, 320, phone)).toEqual({ band: dockBand(phone, 320), fold: false });
  });
});
