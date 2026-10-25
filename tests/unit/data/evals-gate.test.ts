import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EvalRun } from '../../../src/shared/contracts.ts';
import { gateChecks, gateVerdict, metric } from '../../../src/app/pages/evals/evalModel.ts';

const latest = JSON.parse(readFileSync(new URL('../../../data/evals/latest.json', import.meta.url), 'utf8')) as { promoted: EvalRun; candidate: EvalRun };

describe('eval data and the promotion gate copy', () => {
  it('has per-mess-level precision that adds up to the pooled numbers', () => {
    for (const run of [latest.promoted, latest.candidate]) {
      let num = 0;
      let den = 0;
      for (const n of [1, 2, 3, 4, 5]) {
        const p = metric(run, `precision.level${n}`);
        expect(p?.denominator).toBeGreaterThan(0);
        expect(p?.numerator).toBe(metric(run, `recall.level${n}`)?.numerator);
        num += p!.numerator!;
        den += p!.denominator!;
      }
      const pooled = metric(run, 'precision')!;
      // Edge-case files (no mess level) make up the remainder.
      expect(num).toBeLessThanOrEqual(pooled.numerator!);
      expect(den).toBeLessThanOrEqual(pooled.denominator!);
    }
  });

  it('the gate fails exactly the rules the eval run recorded, and the verdict is written from the numbers', () => {
    const checks = gateChecks(latest.candidate, latest.promoted);
    const failed = checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed.sort()).toEqual(['precision', 'regression']);
    expect(checks.find((c) => c.id === 'cost')).toMatchObject({ ok: true, info: true });
    const verdict = gateVerdict(latest.candidate, latest.promoted);
    expect(verdict).toContain('59.7%');
    expect(verdict).toContain('−28.9 pts');
    expect(verdict).not.toMatch(/faster|cheaper/i);
    // v5 really is slower and costlier in the data, so the copy says so.
    expect(latest.candidate.p95Ms).toBeGreaterThan(latest.promoted.p95Ms);
    expect(verdict).toContain('slower and costs more');
  });
});
