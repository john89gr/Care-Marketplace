import { describe, expect, it } from 'vitest';
import { pickRecipient, recipientsFrom } from './history.recipient';

/**
 * Care-recipient resolution tests (FEATURE_PLAN.md §21 subtask 16): family
 * roles pick a client from their visits so the history page can load the
 * consent-gated family endpoint for the right user.
 */

const MARIA = { clientId: 'u-client', clientName: 'Maria Papadopoulou', scheduledAtMs: 2_000 };
const NIKOS = { clientId: 'u-other', clientName: 'Nikos Georgiou', scheduledAtMs: 1_000 };
const MARIA_OLDER = { clientId: 'u-client', clientName: 'Maria Papadopoulou', scheduledAtMs: 500 };

describe('recipientsFrom', () => {
  it('dedupes by client and orders by most recent visit', () => {
    expect(recipientsFrom([NIKOS, MARIA_OLDER, MARIA])).toEqual([
      { userId: 'u-client', name: 'Maria Papadopoulou' },
      { userId: 'u-other', name: 'Nikos Georgiou' },
    ]);
  });

  it('ignores visits without a client id and falls back to the id as name', () => {
    expect(
      recipientsFrom([
        { clientId: '', clientName: 'N/A', scheduledAtMs: 9 },
        { clientId: 'u-1', clientName: '', scheduledAtMs: 1 },
      ])
    ).toEqual([{ userId: 'u-1', name: 'u-1' }]);
  });

  it('returns an empty list for no visits', () => {
    expect(recipientsFrom([])).toEqual([]);
  });
});

describe('pickRecipient', () => {
  it('picks the most recent visit client', () => {
    expect(pickRecipient([NIKOS, MARIA])).toEqual({
      userId: 'u-client',
      name: 'Maria Papadopoulou',
    });
  });

  it('falls back when the family member has no visits yet', () => {
    const demo = { userId: 'u-client', name: 'Maria Papadopoulou' };
    expect(pickRecipient([], demo)).toEqual(demo);
    expect(pickRecipient([])).toBeNull();
  });
});
