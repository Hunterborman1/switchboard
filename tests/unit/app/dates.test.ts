// A zone west of UTC, where formatting a date-only value as local midnight shows the day before.
process.env.TZ = 'America/Los_Angeles';
import { describe, expect, it } from 'vitest';
import { dateShort, renewalIn } from '../../../src/app/lib/labels';

describe('date-only values are calendar dates', () => {
  it('formats YYYY-MM-DD in UTC, never the previous day', () => {
    expect(dateShort('2027-01-15')).toBe('Jan 15, 2027');
    expect(dateShort('2026-11-30')).toMatch(/^Nov 30/);
    expect(renewalIn('2027-01-15')).toMatch(/^Jan 15, 2027/);
  });
  it('still formats instants in the viewer zone', () => {
    expect(dateShort('2026-10-22T03:00:00Z')).toMatch(/^Oct 21/);
  });
});
