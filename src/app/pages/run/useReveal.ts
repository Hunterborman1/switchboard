/**
 * Reveal for the Run view. Steps are shown as soon as the server reports them: no minimum
 * dwell, so what you see is the run's real speed. When several steps land in one poll they
 * light up one after another, at most STAGGER_MS apart (motion, not pacing). Reduced motion
 * reveals them at once. A step is never shown as done before the server says it is done.
 * A run that finished a while ago opens fully revealed.
 *
 * `replay()` re-runs the reveal of a finished run at its recorded speed: each step appears at
 * its real finish time on the run's own clock (runTiming → rows[].end), 1:1.
 *
 * Emits run.step as each step's reveal completes and run.finished once, when the last step
 * is revealed on a terminal run (a replay of the reveal emits them again).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { STEP_KEYS, type RunStep, type StepKey } from '../../../shared/contracts';
import { emit } from '../../../shared/events';
import { runTiming } from '../../../shared/runTiming';
import type { RunDetail } from '../../api/types';

const DONE = new Set(['passed', 'warned', 'failed', 'skipped']);
const TERMINAL = new Set(['completed', 'awaiting_review', 'failed']);
const STALE_MS = 15_000;
/** Longest gap between two steps that arrive in the same poll. */
export const STAGGER_MS = 120;

export type DisplayStep = RunStep & { display: RunStep['status'] };

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
  /** Re-run the reveal of a finished run at its recorded speed. */
  replay: () => void;
  /** A replay of the reveal is playing. */
  replaying: boolean;
  /** performance.now() when the current replay started (null when not replaying). */
  replayStartedAt: number | null;
  /** True while the reveal is catching up with a finished server run. */
  catchingUp: boolean;
};

export function useReveal(detail: RunDetail | undefined, reduced: boolean): RevealState {
  const runId = detail?.run.id ?? null;
  const [revealed, setRevealed] = useState(0);
  const [replayStartedAt, setReplayStartedAt] = useState<number | null>(null);
  const lastAt = useRef(0);
  const initFor = useRef<string | null>(null);
  const emittedSteps = useRef(new Set<string>());
  const finishedEmitted = useRef<string | null>(null);

  // First data for a run: decide whether to reveal as it runs or open fully revealed.
  useEffect(() => {
    if (!detail || initFor.current === detail.run.id) return;
    initFor.current = detail.run.id;
    emittedSteps.current = new Set();
    setReplayStartedAt(null);
    const terminal = TERMINAL.has(detail.run.status);
    const finishedAt = detail.run.finishedAt ? new Date(detail.run.finishedAt).getTime() : 0;
    const stale = terminal && Date.now() - finishedAt > STALE_MS;
    if (stale) {
      const n = countDone(detail.steps);
      setRevealed(n);
      for (let i = 0; i < n; i++) emittedSteps.current.add(`${detail.run.id}:${i}`);
      finishedEmitted.current = detail.run.id; // historical run: no fresh "finished" event
    } else {
      setRevealed(0);
      finishedEmitted.current = null;
    }
    lastAt.current = 0;
  }, [detail]);

  const serverDone = detail ? countDone(detail.steps) : 0;
  const replaying = replayStartedAt != null;

  // Live: follow the server. Reduced motion jumps straight to it; otherwise a short stagger.
  useEffect(() => {
    if (!detail || replaying || revealed >= serverDone) return;
    if (reduced) {
      setRevealed(serverDone);
      return;
    }
    const wait = Math.max(0, STAGGER_MS - (performance.now() - lastAt.current));
    const t = window.setTimeout(() => {
      lastAt.current = performance.now();
      setRevealed((r) => Math.min(r + 1, serverDone));
    }, wait);
    return () => window.clearTimeout(t);
  }, [detail, revealed, serverDone, replaying, reduced]);

  // Replay: each step at its recorded finish time on the run's own clock.
  useEffect(() => {
    if (!detail || replayStartedAt == null) return;
    if (revealed >= serverDone) {
      setReplayStartedAt(null);
      return;
    }
    const timing = runTiming(detail);
    const key = STEP_KEYS[revealed]!;
    const at = timing?.rows.find((r) => r.key === key)?.end ?? 0;
    const wait = Math.max(0, at - (performance.now() - replayStartedAt));
    const t = window.setTimeout(() => setRevealed((r) => Math.min(r + 1, serverDone)), wait);
    return () => window.clearTimeout(t);
  }, [detail, revealed, serverDone, replayStartedAt]);

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
    if (!detail || !TERMINAL.has(detail.run.status)) return;
    emittedSteps.current = new Set();
    finishedEmitted.current = null;
    setRevealed(0);
    setReplayStartedAt(performance.now());
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
    return { ...s, display };
  });

  return {
    revealed,
    steps,
    activeIdx,
    done: (key) => STEP_KEYS.indexOf(key) < revealed,
    finished: terminal && revealed >= serverDone && !replaying,
    replay,
    replaying,
    replayStartedAt,
    catchingUp: terminal && revealed < serverDone && !replaying,
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
