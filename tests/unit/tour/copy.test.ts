import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { candidateCopy, candidateTitle, introCopy, introTitle, promoteCopy, themeCopy, timingCopy } from '../../../src/tour/script/copy';
import type { TourCtx } from '../../../src/tour/engine/types';
import type { EvalRun, RunDetail, Theme } from '../../../src/shared/contracts';

const base = (patch: Partial<TourCtx> = {}): TourCtx => ({
  path: 'main',
  fileId: null,
  runId: null,
  themeId: null,
  explored: [],
  counters: { approvals: 0, edits: 0, rejects: 0, rulesChanged: 0, shipped: 0, promoteAttempts: 0, promoted: null, redactionToggled: false, deliveriesOpened: 0 },
  run: null,
  evals: null,
  budget: null,
  ops: null,
  peek: null,
  theme: null,
  pathname: '/',
  lastEvent: null,
  ...patch,
});

// The real eval runs the walkthrough narrates (v4 promoted, v5 candidate).
const evals = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/evals/latest.json'), 'utf8')) as { promoted: EvalRun; candidate: EvalRun; history: EvalRun[] };
const ctxEvals = base({ evals: { latest: evals.promoted, candidate: evals.candidate, history: evals.history ?? [] } });

describe('operate (prove it) copy agrees with the eval data on screen', () => {
  it('never calls the candidate cheaper or faster unless the numbers say so', () => {
    const c = evals.candidate;
    const l = evals.promoted;
    const body = candidateCopy(ctxEvals);
    const title = candidateTitle(ctxEvals);
    if (c.costUsd >= l.costUsd) {
      expect(body).not.toMatch(/\bcheaper\b/);
      expect(title).not.toMatch(/cheaper/i);
      expect(body).toMatch(/more expensive/);
    }
    if (c.p95Ms >= l.p95Ms) {
      expect(body).not.toMatch(/\bfaster\b/);
      expect(body).toMatch(/slower at p95/);
    }
  });

  it('the gate names only its real reasons (precision), and cost/latency as reported, not gated', () => {
    const { title, body, more = '' } = promoteCopy(ctxEvals);
    expect(title).toBe('Promotion blocked');
    expect(body).toMatch(/Blocked on precision: from 88\.7% to 59\.7%, under the 85% bar and a 29-point regression/);
    expect(body).not.toMatch(/→/);
    expect(`${body} ${more}`).not.toMatch(/invented|never raised|one regression/i);
    expect(more).toMatch(/reported, not gated/);
    if (evals.candidate.costUsd >= evals.promoted.costUsd) expect(more).toMatch(/costs more/);
    if (evals.candidate.p95Ms >= evals.promoted.p95Ms) expect(more).toMatch(/runs slower/);
    expect(more).not.toMatch(/whatever it saves/i);
  });

  it('uses sentence case, not all caps', () => {
    expect(promoteCopy(base()).title).toBe('Promotion blocked');
  });
});

describe('narration matches what is shown', () => {
  it('patterns names the theme it was given, with plural-correct counts', () => {
    const theme = { id: 'thm_offline_conv', name: 'Google Ads offline conversions arrive late', insightCount: 36, accountCount: 1, arrUsd: 4_200_000 } as Theme;
    const t = themeCopy(base({ theme }));
    expect(t.intro).toContain('Google Ads offline conversions arrive late');
    expect(t.intro).toContain('36 insights from 1 account.');
  });

  it('call.watch says replay when the run is a replay', () => {
    const run = { run: { mode: 'replay', status: 'running' } } as unknown as RunDetail;
    expect(introCopy(base({ run }))).toMatch(/recorded real execution, replayed at its recorded speed/);
    expect(introCopy(base())).toMatch(/real execution, not an animation/);
  });

  it('call.watch says earlier run, never "real execution", when an earlier run was reopened', () => {
    const run = { run: { mode: 'live', status: 'completed' } } as unknown as RunDetail;
    const copy = introCopy(base({ run, runReused: true }));
    expect(copy).toMatch(/earlier run/);
    expect(copy).not.toMatch(/real execution/);
  });

  it('call.watch title states the run as it is: live and running, or done with its real time', () => {
    const running = { run: { mode: 'live', status: 'running', durationMs: null } } as unknown as RunDetail;
    const done = { run: { mode: 'live', status: 'awaiting_review', durationMs: 6090 } } as unknown as RunDetail;
    expect(introTitle(base({ run: running }))).toBe('Running live, right now');
    expect(introTitle(base({ run: done }))).toBe('Done in 6.09 s, live');
  });
});

describe('call.timing: why it is fast, from the run’s own timestamps', () => {
  const t0 = Date.parse('2026-10-25T10:00:00.000Z');
  const at = (ms: number) => new Date(t0 + ms).toISOString();
  const step = (key: string, start: number, end: number, extra: Record<string, unknown> = {}) => ({
    runId: 'run_1',
    key,
    status: 'passed',
    startedAt: at(start),
    finishedAt: at(end),
    durationMs: end - start,
    model: null,
    tokensIn: null,
    tokensOut: null,
    costUsd: null,
    summary: null,
    detail: null,
    ...extra,
  });
  // Shaped like the live Brightline run: triage on the decision model alongside extraction on the main model.
  const live = {
    run: { id: 'run_1', mode: 'live', status: 'awaiting_review', durationMs: 6090, createdAt: at(-20) },
    steps: [
      step('ingest', 0, 2),
      step('normalize', 2, 4),
      step('redact', 4, 9),
      step('screen', 16, 1566, { model: 'z-ai/glm-5.3-flash', tokensIn: 3000, tokensOut: 80, costUsd: 0.0002 }),
      step('extract', 1566, 4956, { model: 'deepseek/deepseek-v4.1-flash', tokensIn: 6000, tokensOut: 1100, costUsd: 0.0025, detail: { startedWithScreen: true, callMs: 4940 } }),
      step('ground', 4956, 4959),
      step('score', 4959, 6029, { model: 'z-ai/glm-5.3-flash', tokensIn: 2000, tokensOut: 185, costUsd: 0.0007 }),
      step('theme', 6029, 6030, { detail: { embedModel: '@cf/baai/bge-base-en-v1.5' } }),
      step('route', 6030, 6031),
      step('deliver', 6031, 6036),
    ],
  } as unknown as RunDetail;

  it('names triage alongside extraction with the real numbers, and the code steps', () => {
    const c = timingCopy({ run: live });
    expect(c.title).toBe('Why it took 6.09 s');
    expect(c.body).toMatch(/Triage \(1\.55 s\) ran alongside extraction \(4\.94 s\), not before it\./);
    expect(c.body).toMatch(/The 6 code steps took 18 ms in all\./);
    expect(c.more).toMatch(/second opinion \(1\.07 s\) overlaps the theme lookups/);
    expect(c.more).toMatch(/Agent Ops/);
  });

  it('says replay, and stays generic and honest with no data', () => {
    const replay = { ...live, run: { ...live.run, mode: 'replay' } } as unknown as RunDetail;
    expect(timingCopy({ run: replay }).more).toMatch(/replay of a recorded live run, at its recorded speed/);
    const g = timingCopy({ run: null });
    expect(g.title).toBe('Why it’s this fast');
    expect(g.body).not.toMatch(/\d/);
  });
});
