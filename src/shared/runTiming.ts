/**
 * Where a run's time went, from its real step rows (startedAt / finishedAt / durationMs). Pure,
 * shared by the conversation page's Timing card and the walkthrough's narration, so the two can
 * never disagree.
 *
 * Extraction starts alongside triage on the fast path: the extract row itself starts when triage
 * finishes and records only the wait that was left (detail.startedWithScreen, detail.callMs). The
 * extraction call is therefore drawn from triage's start to the extract row's finish. Replays
 * are served re-timed to that same shape (src/pipeline/replay.ts → fastPathTiming), so they are
 * drawn the same way and labelled as re-timed.
 */
import { STEP_KEYS, type RunDetail, type RunStep, type StepKey } from './contracts.ts';

export type TimingRow = {
  key: StepKey;
  /** Milliseconds from the run's first step start, on one shared clock. */
  start: number;
  end: number;
  /** What the bar represents in ms (for a parallel extraction: the whole call, from triage's start). */
  ms: number;
  /** The step called a model (the role label comes from its model id). */
  ai: boolean;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  status: RunStep['status'];
  /** Extraction that started together with triage. */
  withTriage: boolean;
  /** Code-only step that finished in under a millisecond. */
  instant: boolean;
  /** Score step that carried the decision model's second opinion. */
  secondOpinion: boolean;
  /** Theme step whose work was embeddings and nearest-neighbour lookups rather than a model call. */
  lookups: boolean;
  /**
   * Model time this step spent after the run had finished (new themes are named after the run:
   * detail.namingDeferred / namingMs). Not on the run's clock and not in its wall time; null if none.
   */
  afterRunMs: number | null;
};

export type RunTiming = {
  /** Epoch ms of the first step start (or the run's createdAt when steps carry no timestamps). */
  t0: number;
  /** Wall time end to end, from the run row when it has one. */
  wallMs: number;
  /** Width of the shared clock (the latest bar end). */
  spanMs: number;
  rows: TimingRow[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** Triage (decision model) call time. */
  triageMs: number | null;
  /** Extraction call time (from triage's start when it ran alongside). */
  extractMs: number | null;
  /** Triage and extraction overlapped. */
  parallel: boolean;
  /** Steps that ran no model and took under a millisecond. */
  instantSteps: number;
  secondOpinionMs: number | null;
  themeMs: number | null;
  /** Every step had real timestamps (false: laid out from durations, one after another). */
  timestamped: boolean;
  replay: boolean;
  /** Every step has finished (passed, warned, failed or skipped). */
  complete: boolean;
};

const DONE = new Set(['passed', 'warned', 'failed', 'skipped']);
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** Null until the run has step rows to measure. */
export function runTiming(d: Pick<RunDetail, 'run' | 'steps'> | null | undefined): RunTiming | null {
  if (!d || !d.steps.length) return null;
  const byKey = new Map(d.steps.map((s) => [s.key, s]));
  const ordered = STEP_KEYS.map((k) => byKey.get(k)).filter((s): s is RunStep => !!s);
  const done = ordered.filter((s) => DONE.has(s.status));
  if (!done.length) return null;
  const replay = d.run.mode === 'replay';
  const timestamped = done.every((s) => Number.isFinite(ms(s.startedAt)) && Number.isFinite(ms(s.finishedAt)));

  const starts = done.map((s) => ms(s.startedAt)).filter(Number.isFinite);
  const t0 = timestamped && starts.length ? Math.min(...starts) : ms(d.run.createdAt) || 0;
  const screen = byKey.get('screen');
  const screenStart = screen && Number.isFinite(ms(screen.startedAt)) ? ms(screen.startedAt) - t0 : null;

  let cursor = 0;
  const rows: TimingRow[] = [];
  for (const s of done) {
    const dur = s.status === 'skipped' ? 0 : Math.max(0, s.durationMs ?? 0);
    let start: number;
    let end: number;
    if (timestamped) {
      start = ms(s.startedAt) - t0;
      end = Math.max(start, ms(s.finishedAt) - t0);
    } else {
      start = cursor;
      end = cursor + dur;
    }
    cursor = end;
    const ai = !!s.model && s.status !== 'skipped';
    const detail = (s.detail ?? {}) as Record<string, unknown>;
    const withTriage = s.key === 'extract' && ai && screenStart != null && (detail.startedWithScreen === true || replay);
    if (withTriage) start = Math.min(start, screenStart!);
    rows.push({
      key: s.key,
      start,
      end,
      ms: withTriage ? end - start : dur,
      ai,
      model: ai ? s.model : null,
      tokensIn: s.tokensIn ?? 0,
      tokensOut: s.tokensOut ?? 0,
      costUsd: s.costUsd ?? 0,
      status: s.status,
      withTriage,
      instant: !ai && s.status !== 'skipped' && s.status !== 'failed' && dur < 1,
      secondOpinion: s.key === 'score' && ai,
      lookups: s.key === 'theme' && !ai && s.status !== 'skipped' && typeof detail.embedModel === 'string',
      afterRunMs: s.key === 'theme' && detail.namingDeferred === true && typeof detail.namingMs === 'number' ? detail.namingMs : null,
    });
  }
  const spanMs = rows.reduce((m, r) => Math.max(m, r.end), 0);
  const row = (k: StepKey) => rows.find((r) => r.key === k);
  const tri = row('screen');
  const ext = row('extract');
  const so = row('score');
  const th = row('theme');
  return {
    t0,
    wallMs: d.run.durationMs ?? spanMs,
    spanMs,
    rows,
    tokensIn: rows.reduce((a, r) => a + r.tokensIn, 0),
    tokensOut: rows.reduce((a, r) => a + r.tokensOut, 0),
    costUsd: rows.reduce((a, r) => a + r.costUsd, 0),
    triageMs: tri && tri.ai ? tri.ms : null,
    extractMs: ext && ext.ai ? ext.ms : null,
    parallel: !!ext?.withTriage,
    instantSteps: rows.filter((r) => r.instant).length,
    secondOpinionMs: so?.secondOpinion ? so.ms : null,
    themeMs: th && th.status !== 'skipped' ? th.ms : null,
    timestamped,
    replay,
    complete: ordered.length === STEP_KEYS.length && ordered.every((s) => DONE.has(s.status)),
  };
}

/** Seconds since the run started, for a live clock. Clamped so a skewed device clock never shows nonsense. */
export function runElapsedMs(d: Pick<RunDetail, 'run' | 'steps'> | null | undefined, now: number): number | null {
  if (!d) return null;
  const firstStart = d.steps.map((s) => ms(s.startedAt)).filter(Number.isFinite);
  const start = firstStart.length ? Math.min(...firstStart) : ms(d.run.createdAt);
  if (!Number.isFinite(start)) return null;
  const e = now - start;
  return e < 0 || e > 10 * 60_000 ? null : e;
}
