import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { candidateCopy, candidateTitle, introCopy, promoteCopy, themeCopy } from '../../../src/tour/script/copy';
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

describe('ch7 copy agrees with the eval data on screen', () => {
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
    const { title, body } = promoteCopy(ctxEvals);
    expect(title).toBe('Promotion blocked');
    expect(body).toMatch(/Blocked on precision: 88\.7% → 59\.7%, under the 85% bar and a 29-point regression/);
    expect(body).not.toMatch(/invented|never raised|one regression/i);
    expect(body).toMatch(/reported, not gated/);
    if (evals.candidate.costUsd >= evals.promoted.costUsd) expect(body).toMatch(/costs more/);
    if (evals.candidate.p95Ms >= evals.promoted.p95Ms) expect(body).toMatch(/runs slower/);
    expect(body).not.toMatch(/whatever it saves/i);
  });

  it('uses sentence case, not all caps', () => {
    expect(promoteCopy(base()).title).toBe('Promotion blocked');
  });
});

describe('narration matches what is shown', () => {
  it('ch5 names the theme it was given, with plural-correct counts', () => {
    const theme = { id: 'thm_offline_conv', name: 'Google Ads offline conversions arrive late', insightCount: 36, accountCount: 1, arrUsd: 4_200_000 } as Theme;
    const t = themeCopy(base({ theme }));
    expect(t.intro).toContain('Google Ads offline conversions arrive late');
    expect(t.intro).toContain('36 insights from 1 account.');
  });

  it('ch2.intro says replay when the run is a replay', () => {
    const run = { run: { mode: 'replay' } } as unknown as RunDetail;
    expect(introCopy(base({ run }))).toMatch(/recorded real execution, replayed at real speed/);
    expect(introCopy(base())).toMatch(/real execution, not an animation/);
  });
});
