/**
 * Product ↔ walkthrough state the product READS (it never imports the tour):
 * - `tourActive`: the walkthrough is running (the file picker then marks the suggested file)
 * - `pace`: minimum dwell per pipeline step in the Run view (ms). Humans need ~350–500ms
 *   to follow a step; the tour can raise it to ~900ms while narrating.
 *
 * The tour sets it with `setTourState({...})` (exported from src/app/index.ts); with no
 * explicit call, `tourActive` follows the `?tour=` URL parameter the engine writes.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export type TourState = { tourActive: boolean; pace: number };

export const DEFAULT_PACE_MS = 420;
let explicit: Partial<TourState> = {};
let snapshot: TourState = compute();
const subs = new Set<() => void>();

function urlTourActive(): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.has('tour') && sp.get('tour') !== 'off';
  } catch {
    return false;
  }
}

function compute(): TourState {
  const tourActive = explicit.tourActive ?? urlTourActive();
  const pace = explicit.pace ?? DEFAULT_PACE_MS;
  return { tourActive, pace: Math.max(0, Math.min(2000, pace)) };
}

function publish() {
  const next = compute();
  if (next.tourActive !== snapshot.tourActive || next.pace !== snapshot.pace) {
    snapshot = next;
    subs.forEach((fn) => fn());
  }
}

/** Called by the walkthrough. Pass `undefined` for a field to fall back to the default. */
export function setTourState(next: Partial<TourState>): void {
  explicit = { ...explicit, ...next };
  publish();
}

export function getTourState(): TourState {
  return snapshot;
}

export function useTourState(): TourState {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      const onPop = () => publish();
      window.addEventListener('popstate', onPop);
      return () => {
        subs.delete(fn);
        window.removeEventListener('popstate', onPop);
      };
    },
    () => snapshot,
  );
}

/** Re-check the URL after client-side navigation (the router does not fire popstate on push). */
export function refreshTourStateFromUrl(): void {
  publish();
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
