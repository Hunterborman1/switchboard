/**
 * Reveal pacing for the Run view. The pipeline can finish faster than a person can follow,
 * so steps are revealed one at a time with a minimum dwell (`pace`, default ~420ms; the tour
 * raises it to ~900ms). A step is never shown as done before the server says it is done.
 * Reduced motion reveals instantly. A run that finished a while ago opens fully revealed;
 * `replay()` re-runs the reveal from the recorded rows.
 *
 * Emits run.step as each step's reveal completes and run.finished once, when the last step
 * is revealed on a terminal run.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { STEP_KEYS, type RunStep, type StepKey } from '../../../shared/contracts';
import { emit } from '../../../shared/events';
import type { RunDetail } from '../../api/types';

const DONE = new Set(['passed', 'warned', 'failed', 'skipped']);
const TERMINAL = new Set(['completed', 'awaiting_review', 'failed']);
const STALE_MS = 15_000;

export type DisplayStep = RunStep & { display: RunStep['status']; revealedAt: number | null };

export type RevealState = {
  /** Number of steps fully revealed (0..10). */
  revealed: number;
  steps: DisplayStep[];
  /** Index of the step currently shown as running, or -1. */
  activeIdx: number;
  /** Has step `key` been revealed as done? */
  done: (key: StepKey) => boolean;
  /** All steps revealed and the run is terminal. */
  finished: boolean;
  replay: () => void;
  /** True while the reveal is catching up with a finished server run. */
  catchingUp: boolean;
};

export function useReveal(detail: RunDetail | undefined, pace: number, reduced: boolean): RevealState {
  const runId = detail?.run.id ?? null;
  const [revealed, setRevealed] = useState(0);
  const [stamps, setStamps] = useState<number[]>([]);
  const lastAt = useRef(0);
  const initFor = useRef<string | null>(null);
  const emittedSteps = useRef(new Set<string>());
  const finishedEmitted = useRef<string | null>(null);

  // First data for a run: decide whether to animate or open fully revealed.
  useEffect(() => {
    if (!detail || initFor.current === detail.run.id) return;
    initFor.current = detail.run.id;
    emittedSteps.current = new Set();
    const terminal = TERMINAL.has(detail.run.status);
    const finishedAt = detail.run.finishedAt ? new Date(detail.run.finishedAt).getTime() : 0;
    const stale = terminal && Date.now() - finishedAt > STALE_MS;
    if (stale) {
      const n = countDone(detail.steps);
      setRevealed(n);
      setStamps(Array.from({ length: n }, () => 0));
      for (let i = 0; i < n; i++) emittedSteps.current.add(`${detail.run.id}:${i}`);
      finishedEmitted.current = detail.run.id; // historical run: no fresh "finished" event
    } else {
      setRevealed(0);
      setStamps([]);
      finishedEmitted.current = null;
    }
    lastAt.current = performance.now();
  }, [detail]);

  const serverDone = detail ? countDone(detail.steps) : 0;
  const effectivePace = reduced ? 0 : pace;

  // Advance one step at a time, never faster than `pace`.
  useEffect(() => {
    if (!detail || revealed >= STEP_KEYS.length || revealed >= serverDone) return;
    const wait = Math.max(0, effectivePace - (performance.now() - lastAt.current));
    const t = window.setTimeout(() => {
      lastAt.current = performance.now();
      setRevealed((r) => Math.min(r + 1, serverDone));
      setStamps((s) => [...s, Date.now()]);
    }, wait);
    return () => window.clearTimeout(t);
  }, [detail, revealed, serverDone, effectivePace]);

  // Events
  useEffect(() => {
    if (!detail) return;
    for (let i = 0; i < revealed; i++) {
      const k = `${detail.run.id}:${i}`;
      if (emittedSteps.current.has(k)) continue;
      emittedSteps.current.add(k);
      const step = detail.steps.find((s) => s.key === STEP_KEYS[i]);
      emit({ name: 'run.step', runId: detail.run.id, step: STEP_KEYS[i]!, status: step?.status ?? 'passed' });
    }
    const terminal = TERMINAL.has(detail.run.status);
    if (terminal && revealed >= serverDone && finishedEmitted.current !== detail.run.id) {
      finishedEmitted.current = detail.run.id;
      emit({ name: 'run.finished', runId: detail.run.id, status: detail.run.status });
    }
  }, [detail, revealed, serverDone]);

  const replay = useCallback(() => {
    if (!detail) return;
    emittedSteps.current = new Set();
    finishedEmitted.current = null;
    lastAt.current = performance.now();
    setRevealed(0);
    setStamps([]);
  }, [detail]);

  const byKey = new Map((detail?.steps ?? []).map((s) => [s.key, s]));
  const terminal = detail ? TERMINAL.has(detail.run.status) : false;
  const failed = detail?.run.status === 'failed';
  let activeIdx = -1;
  const steps: DisplayStep[] = STEP_KEYS.map((key, i) => {
    const s =
      byKey.get(key) ??
      ({ runId: runId ?? '', key, status: 'pending', startedAt: null, finishedAt: null, durationMs: null, model: null, tokensIn: null, tokensOut: null, costUsd: null, summary: null, detail: null } as RunStep);
    let display: RunStep['status'] = 'pending';
    if (i < revealed) display = s.status;
    else if (i === revealed && detail && (s.status === 'running' || DONE.has(s.status) || (detail.run.status === 'running' && i === 0))) {
      display = failed && DONE.has(s.status) && s.status === 'failed' && i >= serverDone ? 'failed' : 'running';
      activeIdx = i;
    }
    return { ...s, display, revealedAt: stamps[i] ?? null };
  });

  return {
    revealed,
    steps,
    activeIdx,
    done: (key) => STEP_KEYS.indexOf(key) < revealed,
    finished: terminal && revealed >= serverDone,
    replay,
    catchingUp: terminal && revealed < serverDone,
  };
}

function countDone(steps: RunStep[]): number {
  let n = 0;
  for (const key of STEP_KEYS) {
    const s = steps.find((x) => x.key === key);
    if (!s || !DONE.has(s.status)) break;
    n++;
  }
  return n;
}
