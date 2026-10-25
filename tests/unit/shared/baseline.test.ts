import { describe, expect, it } from 'vitest';
import agents from '../../../data/platform/agents.json';
import { MINUTES_SAVED_PER_CALL } from '../../../src/shared/scoring';
import { metricPct, pctText, durationText, explainSpanErrors } from '../../../src/shared/format';

describe('one registered baseline', () => {
  it('the live path credits the same minutes per call as the Agent Ops registry', () => {
    const sl = (agents as { agents: { record: { id: string; baselineMinutesPerUnit: number } }[] }).agents.find((a) => a.record.id === 'agt_signal_loop');
    expect(sl?.record.baselineMinutesPerUnit).toBe(18);
    expect(MINUTES_SAVED_PER_CALL).toBe(sl?.record.baselineMinutesPerUnit);
  });
});

describe('shared formatters', () => {
  it('formats a rate from its exact fraction, half-up (125/141 reads 88.7% everywhere)', () => {
    expect(metricPct({ value: 0.8865, numerator: 125, denominator: 141 })).toBe('88.7%');
    expect(pctText(0.8865)).toBe('88.7%');
    expect(metricPct({ value: 0.5972, numerator: 126, denominator: 211 })).toBe('59.7%');
  });
  it('never shows "0 ms"', () => {
    expect(durationText(0)).toBe('<1 ms');
    expect(durationText(4060)).toBe('4.06 s');
  });
  it('explains retried delivery errors', () => {
    const s = (status: 'ok' | 'error', start: string) => ({ name: 'delivery.jira', start, status, attrs: { destination: 'SAI' } });
    expect(explainSpanErrors([s('error', '1'), s('ok', '2'), s('error', '3'), s('ok', '4')])).toMatch(/2 Jira delivery attempts failed and were retried/);
    expect(explainSpanErrors([s('ok', '1')])).toBeNull();
  });
});
