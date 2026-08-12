import { describe, expect, it, vi } from 'vitest';

/**
 * pickWinners — the pure winner-resolution step of the Community-Award publish
 * flow (Task 8). Properties under lock:
 *
 *   * ONE winner per category (the tally has a row per (category, target));
 *   * top votes wins;
 *   * a vote tie breaks to the lexicographically-lowest target_id, so
 *     re-running the publish can never pick a different winner (deterministic
 *     — the §20 result must not depend on row order);
 *   * empty tally → empty winners (a closed cycle with zero votes publishes
 *     no posts).
 */

// publish.ts pulls ApiError from @/lib/api (Sentry + next/server at module
// scope) — inert here; pickWinners is pure.
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { pickWinners, type AwardWinner } from './publish';

function row(
  category: AwardWinner['category'],
  targetId: string,
  votes: number,
  targetType: AwardWinner['targetType'] = 'user',
): AwardWinner {
  return { category, targetType, targetId, votes };
}

describe('pickWinners', () => {
  it('returns one winner per category — the top-voted target', () => {
    const winners = pickWinners([
      row('most_helpful', 'aaa', 5),
      row('most_helpful', 'bbb', 3),
      row('best_win', 'ccc', 4, 'post'),
      row('best_win', 'ddd', 1, 'post'),
      row('best_lab', 'eee', 2, 'lab'),
    ]);

    expect(winners).toHaveLength(3);
    expect(winners).toContainEqual(row('most_helpful', 'aaa', 5));
    expect(winners).toContainEqual(row('best_win', 'ccc', 4, 'post'));
    expect(winners).toContainEqual(row('best_lab', 'eee', 2, 'lab'));
  });

  it('breaks vote ties to the lexicographically-lowest target_id, regardless of row order', () => {
    const tied = [row('rising_builder', 'zzz', 4), row('rising_builder', 'abc', 4)];

    const forward = pickWinners(tied);
    const reversed = pickWinners([...tied].reverse());

    expect(forward).toEqual([row('rising_builder', 'abc', 4)]);
    expect(reversed).toEqual(forward);
  });

  it('a higher vote count beats a lower target_id (the tie-break is a tie-break, not a sort key)', () => {
    const winners = pickWinners([
      row('most_helpful', 'aaa', 2),
      row('most_helpful', 'zzz', 6),
    ]);
    expect(winners).toEqual([row('most_helpful', 'zzz', 6)]);
  });

  it('an empty tally yields no winners', () => {
    expect(pickWinners([])).toEqual([]);
  });
});
