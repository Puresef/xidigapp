import { describe, expect, it } from 'vitest';

import { DORMANCY_DAYS } from './constants';
import { computeDormant, daysUntil, isCharterComplete } from './views';

/** Pure Labs helpers (charter gate, sprint countdown, dormancy math). */

describe('isCharterComplete', () => {
  it('is true only when all three charter fields are present', () => {
    expect(
      isCharterComplete({ problem_statement: 'p', hypothesis: 'h', success_definition: 's' }),
    ).toBe(true);
  });

  it('is false when any charter field is missing', () => {
    expect(
      isCharterComplete({ problem_statement: 'p', hypothesis: 'h', success_definition: null }),
    ).toBe(false);
    expect(
      isCharterComplete({ problem_statement: null, hypothesis: null, success_definition: null }),
    ).toBe(false);
  });
});

describe('daysUntil', () => {
  const now = Date.UTC(2026, 6, 6, 0, 0, 0); // 2026-07-06

  it('returns null for no deadline', () => {
    expect(daysUntil(null, now)).toBeNull();
  });

  it('counts whole days to a future deadline', () => {
    const inEightDays = new Date(now + 8 * 86_400_000).toISOString();
    expect(daysUntil(inEightDays, now)).toBe(8);
  });

  it('goes negative once the deadline has passed', () => {
    const twoDaysAgo = new Date(now - 2 * 86_400_000).toISOString();
    expect(daysUntil(twoDaysAgo, now)).toBeLessThan(0);
  });
});

describe('computeDormant', () => {
  const now = Date.UTC(2026, 6, 6, 0, 0, 0);

  it('is dormant when dormant_since is set', () => {
    expect(
      computeDormant({ dormant_since: '2026-07-01T00:00:00Z', last_activity_at: '2026-07-05T00:00:00Z' }, now),
    ).toBe(true);
  });

  it('is not dormant with recent activity', () => {
    const recent = new Date(now - 3 * 86_400_000).toISOString();
    expect(computeDormant({ dormant_since: null, last_activity_at: recent }, now)).toBe(false);
  });

  it('is dormant past the idle threshold even before the sweep flags it', () => {
    const stale = new Date(now - (DORMANCY_DAYS + 2) * 86_400_000).toISOString();
    expect(computeDormant({ dormant_since: null, last_activity_at: stale }, now)).toBe(true);
  });
});
