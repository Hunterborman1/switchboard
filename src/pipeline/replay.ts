/**
 * Replay: a recorded real run, revealed progressively by elapsed time. The Worker stores the
 * recording's steps with their offsets; GET /runs/:id computes what is visible "now", so a
 * replay looks exactly like a live run except for mode/modeReason.
 */
import type { Delivery, Insight, Notification, Redaction, RunStep, ScreenOutput, StepKey, Turn } from '../shared/contracts.ts';
import { STEP_KEYS } from '../shared/contracts.ts';
import type { NewTheme, PipelineResult } from './types.ts';

export type RecordedStep = Omit<RunStep, 'runId' | 'startedAt' | 'finishedAt'> & { offsetMs: number };

export type ReplayRecording = {
  version: 1;
  fileId: string;
  recordedAt: string;
  promptVersion: string;
  model: string | null;
  totalMs: number;
  run: { sha256: string; format: string; status: 'awaiting_review' | 'completed' | 'failed'; costUsd: number; durationMs: number; injectionFlagged: boolean; actionable: boolean | null };
  steps: RecordedStep[];
  turns: Turn[];
  redactions: Redaction[];
  screen: ScreenOutput | null;
  insights: Insight[];
  deliveries: Delivery[];
  notifications: Notification[];
  newThemes: Omit<NewTheme, 'vector'>[];
};

/** Turn a pipeline result into a recording (step offsets from the first step's start). */
export function toRecording(fileId: string, r: PipelineResult, recordedAt: string, promptVersion: string): ReplayRecording {
  const first = r.steps[0]?.startedAt ? Date.parse(r.steps[0].startedAt) : Date.parse(recordedAt);
  const steps: RecordedStep[] = r.steps.map((s) => {
    const { runId: _r, startedAt, finishedAt: _f, ...rest } = s;
    return { ...rest, offsetMs: startedAt ? Math.max(0, Date.parse(startedAt) - first) : 0 };
  });
  const last = steps[steps.length - 1];
  return {
    version: 1,
    fileId,
    recordedAt,
    promptVersion,
    model: r.insights[0]?.model ?? r.steps.find((s) => s.key === 'extract')?.model ?? null,
    totalMs: last ? last.offsetMs + (last.durationMs ?? 0) : 0,
    run: { sha256: r.sha256, format: r.format, status: r.status, costUsd: r.costUsd, durationMs: r.durationMs, injectionFlagged: r.injectionFlagged, actionable: r.actionable },
    steps,
    turns: r.turns,
    redactions: r.redactions,
    screen: r.screen,
    insights: r.insights,
    deliveries: r.deliveries,
    notifications: r.notifications,
    newThemes: r.newThemes.map(({ vector: _v, ...t }) => t),
  };
}

/**
 * Re-time a recording to the fast path's shape. Recordings were made with the sequential core
 * (screen, then extract; theme names generated inside the theme step). Live runs now start
 * extraction alongside screening and name new themes after the run, so a replay shows:
 * extract waiting only for the remainder of its call, and theme without the naming call.
 * Step order, outputs, costs and every other duration are unchanged.
 */
export function fastPathTiming(rec: ReplayRecording, themeBaseMs = 380): ReplayRecording {
  const byKey = new Map(rec.steps.map((s) => [s.key, s]));
  const screen = byKey.get('screen');
  const durations = new Map<StepKey, number>();
  for (const s of rec.steps) {
    let d = s.durationMs ?? 0;
    if (s.key === 'extract' && screen && s.status !== 'skipped' && s.model) d = Math.max(150, d - (screen.durationMs ?? 0));
    if (s.key === 'theme' && s.model) d = Math.min(d, themeBaseMs);
    durations.set(s.key, d);
  }
  let t = rec.steps[0]?.offsetMs ?? 0;
  const ordered = [...rec.steps].sort((a, b) => STEP_KEYS.indexOf(a.key) - STEP_KEYS.indexOf(b.key));
  const steps = ordered.map((s, i) => {
    const prev = ordered[i - 1];
    // Keep any recorded gap between steps (normally 0-2ms).
    const gap = prev ? Math.max(0, s.offsetMs - (prev.offsetMs + (prev.durationMs ?? 0))) : 0;
    t += gap;
    const out = { ...s, offsetMs: t, durationMs: s.durationMs === null ? null : durations.get(s.key)! };
    t += out.durationMs ?? 0;
    return out;
  });
  return { ...rec, steps, totalMs: t, run: { ...rec.run, durationMs: Math.min(rec.run.durationMs, t) } };
}

export type StoredStep = RunStep & { offsetMs: number | null };

/** What each step looks like `nowMs` after a replay run was created at `startMs`. */
export function revealSteps(steps: StoredStep[], startMs: number, nowMs: number): RunStep[] {
  const elapsed = nowMs - startMs;
  const byKey = new Map(steps.map((s) => [s.key, s]));
  return STEP_KEYS.filter((k) => byKey.has(k)).map((k) => {
    const s = byKey.get(k)!;
    const { offsetMs, ...row } = s;
    const off = offsetMs ?? 0;
    const end = off + (s.durationMs ?? 0);
    if (elapsed >= end) return { ...row, startedAt: new Date(startMs + off).toISOString(), finishedAt: new Date(startMs + end).toISOString() };
    const blank = { model: null, tokensIn: null, tokensOut: null, costUsd: null, summary: null, detail: null, durationMs: null, finishedAt: null };
    if (elapsed >= off) return { ...row, ...blank, status: 'running', startedAt: new Date(startMs + off).toISOString() };
    return { ...row, ...blank, status: 'pending', startedAt: null };
  });
}

/** Has step `key` finished in this view? */
export function stepDone(view: RunStep[], key: StepKey): boolean {
  const s = view.find((x) => x.key === key);
  return !!s && s.finishedAt !== null && s.status !== 'running' && s.status !== 'pending';
}

export function replayTotalMs(steps: StoredStep[]): number {
  return steps.reduce((m, s) => Math.max(m, (s.offsetMs ?? 0) + (s.durationMs ?? 0)), 0);
}
