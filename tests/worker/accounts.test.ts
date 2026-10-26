/** Which account an uploaded or pasted conversation is about. */
import { describe, expect, it } from 'vitest';
import type { Account } from '../../src/shared/contracts.ts';
import { accountFor } from '../../src/worker/runs.ts';

const acct = (id: string, name: string) => ({ id, name }) as Account;
const accounts = [acct('acc_ridgeway', 'Ridgeway Home Services'), acct('acc_cedar', 'Cedar Ridge Dental')];

describe('accountFor', () => {
  it('reads the account from the text first', () => {
    expect(accountFor('QBR with Cedar Ridge Dental today', 'ridgeway-call.srt', accounts)?.id).toBe('acc_cedar');
  });

  it('falls back to the file name when the text never names it', () => {
    expect(accountFor('Thanks for joining, quick check-in.', 'Ridgeway call 2026-10-19.srt', accounts)?.id).toBe('acc_ridgeway');
    expect(accountFor('Thanks for joining, quick check-in.', 'cedar-ridge-dental_survey.csv', accounts)?.id).toBe('acc_cedar');
  });

  it('returns null when neither names an account', () => {
    expect(accountFor('Thanks for joining.', 'notes.txt', accounts)).toBeNull();
  });
});
