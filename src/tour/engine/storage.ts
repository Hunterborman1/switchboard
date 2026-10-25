import type { Counters, Persisted, TourPath } from './types';
import { TOUR_PATHS } from './types';

const KEY = 'sl-tour-v1';

export const EMPTY_COUNTERS: Counters = {
  approvals: 0, edits: 0, rejects: 0, rulesChanged: 0, shipped: 0, promoteAttempts: 0, promoted: null, redactionToggled: false, deliveriesOpened: 0,
};

export const freshPersisted = (stepId: string): Persisted => ({
  status: 'idle',
  stepId,
  beat: 0,
  history: [],
  ctx: { path: 'main', fileId: null, runId: null, themeId: null, explored: [], counters: { ...EMPTY_COUNTERS } },
  startedAt: null,
  chapterEnteredAt: null,
  finished: false,
});

export function readStored(): Persisted | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (!p || typeof p.stepId !== 'string') return null;
    p.ctx.counters = { ...EMPTY_COUNTERS, ...p.ctx.counters };
    return p;
  } catch {
    return null;
  }
}

export function writeStored(p: Persisted): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: the URL still carries the step */
  }
}

export const isPath = (v: string | null | undefined): v is TourPath => !!v && (TOUR_PATHS as readonly string[]).includes(v);
