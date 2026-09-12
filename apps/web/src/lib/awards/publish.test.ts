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

import { createTranslator } from '@xidig/i18n';

// publish.ts pulls ApiError from @/lib/api (Sentry + next/server at module
// scope) — inert here; pickWinners is pure.
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));
// The end-to-end publish case below stubs the badged system actor and the
// seed registry (their own suites cover them); every other read and write
// goes through the fake service-role client.
vi.mock('@/lib/seed/actor', () => ({ getSeedActorUserId: async () => 'system-actor' }));
vi.mock('@/lib/seed/registry', () => ({
  createSeededEntity: async (_admin: unknown, args: { dedupKey: string }) => ({
    entityId: `post:${args.dedupKey}`,
    created: true,
  }),
}));

import {
  awardTargetKey,
  loadOrganicAwardTally,
  pickWinners,
  publishAwardResults,
  tallyOrganicBallots,
  type AwardBallot,
  type AwardWinner,
} from './publish';

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
    const winners = pickWinners([row('most_helpful', 'aaa', 2), row('most_helpful', 'zzz', 6)]);
    expect(winners).toEqual([row('most_helpful', 'zzz', 6)]);
  });

  it('an empty tally yields no winners', () => {
    expect(pickWinners([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Test-account quarantine (users.is_test, migration 20260912050000).
// award_vote_tally() counts every ballot in SQL — including ballots cast BY
// seeded/test accounts and ballots cast FOR them — so the publish re-tallies
// from award_votes and drops both sides. A test-driven "winner" must lose to
// the real tally.
// ---------------------------------------------------------------------------

const T1 = 't1-test';
const T2 = 't2-test';
const T3 = 't3-test';
const TEST_IDS = new Set([T1, T2, T3]);

function ballot(
  category: AwardBallot['category'],
  targetId: string,
  voterUserId: string,
  targetType: AwardBallot['targetType'] = 'user',
): AwardBallot {
  return { category, targetType, targetId, voterUserId };
}

describe('tallyOrganicBallots', () => {
  it('ignores ballots cast by test accounts — a test-driven winner loses to the real tally', () => {
    const ballots = [
      // Three test accounts pile onto real-z…
      ballot('rising_builder', 'real-z', T1),
      ballot('rising_builder', 'real-z', T2),
      ballot('rising_builder', 'real-z', T3),
      // …one real member votes for real-y.
      ballot('rising_builder', 'real-y', 'r1'),
    ];
    // Control: counted as award_vote_tally() does, real-z would win 3–1.
    expect(pickWinners(tallyOrganicBallots(ballots, new Set()))).toEqual([
      row('rising_builder', 'real-z', 3),
    ]);
    expect(pickWinners(tallyOrganicBallots(ballots, TEST_IDS))).toEqual([
      row('rising_builder', 'real-y', 1),
    ]);
  });

  it('ignores ballots cast FOR a test member, even by real voters', () => {
    const ballots = [
      ballot('most_helpful', T1, 'r1'),
      ballot('most_helpful', T1, 'r2'),
      ballot('most_helpful', T1, 'r3'),
      ballot('most_helpful', 'real-x', 'r4'),
    ];
    expect(pickWinners(tallyOrganicBallots(ballots, TEST_IDS))).toEqual([
      row('most_helpful', 'real-x', 1),
    ]);
  });

  it('ignores a Space led by a test account and a Win written by one; an unknown owner still counts', () => {
    const owners = new Map([
      [awardTargetKey('lab', 'lab-fake'), T2],
      [awardTargetKey('lab', 'lab-real'), 'r9'],
      [awardTargetKey('post', 'win-fake'), T3],
    ]);
    const ballots = [
      ballot('best_lab', 'lab-fake', 'r1', 'lab'),
      ballot('best_lab', 'lab-fake', 'r2', 'lab'),
      ballot('best_lab', 'lab-real', 'r3', 'lab'),
      ballot('best_win', 'win-fake', 'r1', 'post'),
      ballot('best_win', 'win-fake', 'r2', 'post'),
      // No owner row resolved (e.g. the post is gone): counted as before.
      ballot('best_win', 'win-unknown', 'r3', 'post'),
    ];
    const tally = tallyOrganicBallots(ballots, TEST_IDS, owners);
    expect(tally).toEqual(
      expect.arrayContaining([
        row('best_lab', 'lab-real', 1, 'lab'),
        row('best_win', 'win-unknown', 1, 'post'),
      ]),
    );
    expect(tally).toHaveLength(2);
  });

  it('with no test accounts it is exactly the plain per-target count', () => {
    const ballots = [
      ballot('most_helpful', 'a', 'r1'),
      ballot('most_helpful', 'a', 'r2'),
      ballot('most_helpful', 'b', 'r3'),
    ];
    expect(tallyOrganicBallots(ballots, new Set())).toEqual([
      row('most_helpful', 'a', 2),
      row('most_helpful', 'b', 1),
    ]);
  });
});

// A recording fake service-role client: every chain call is logged, and
// awaiting a query resolves that table's next queued result.
type Seed = { data?: unknown; count?: number | null };

function fakeAdmin(queues: Record<string, Seed[]>) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  const rpc = vi.fn();
  const admin = {
    rpc,
    from(table: string) {
      const seed = queues[table]?.shift() ?? {};
      const record = { table, ops: [] as Array<[string, unknown[]]> };
      calls.push(record);
      const chain: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve({
                  data: seed.data ?? null,
                  count: seed.count ?? null,
                  error: null,
                }).then(resolve, reject);
            }
            return (...args: unknown[]) => {
              record.ops.push([String(prop), args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  const opsOf = (table: string, nth = 0) =>
    calls.filter((call) => call.table === table)[nth]?.ops ?? [];
  return { admin: admin as never, calls, rpc, opsOf };
}

function voteRow(category: string, targetType: string, targetId: string, voter: string) {
  return { category, target_type: targetType, target_id: targetId, voter_user_id: voter };
}

describe('loadOrganicAwardTally', () => {
  it('pages through every ballot and resolves lab/post owners only when test accounts exist', async () => {
    const { admin, opsOf, calls } = fakeAdmin({
      award_votes: [
        {
          data: [
            voteRow('best_lab', 'lab', 'lab-fake', 'r1'),
            voteRow('best_lab', 'lab', 'lab-fake', 'r2'),
            voteRow('best_win', 'post', 'win-fake', 'r1'),
          ],
        },
        {
          data: [
            voteRow('best_lab', 'lab', 'lab-real', 'r3'),
            voteRow('best_win', 'post', 'win-real', T1),
          ],
        },
        { data: [] },
      ],
      labs: [
        {
          data: [
            { id: 'lab-fake', lead_user_id: T2 },
            { id: 'lab-real', lead_user_id: 'r9' },
          ],
        },
      ],
      posts: [{ data: [{ id: 'win-fake', author_user_id: T3 }] }],
    });

    const tally = await loadOrganicAwardTally(admin, '2026-Q3', TEST_IDS);

    // lab-fake (test lead) and win-fake (test author) are out; win-real's only
    // ballot was cast by a test account. lab-real is the one organic entry.
    expect(tally).toEqual([row('best_lab', 'lab-real', 1, 'lab')]);
    // Every page was read (3 reads: two with rows, the empty one that ends it),
    // each ordered by id and advanced by the rows actually returned.
    expect(calls.filter((c) => c.table === 'award_votes')).toHaveLength(3);
    expect(opsOf('award_votes', 0)).toContainEqual(['eq', ['quarter', '2026-Q3']]);
    expect(opsOf('award_votes', 0)).toContainEqual(['order', ['id', { ascending: true }]]);
    expect(opsOf('award_votes', 1)).toContainEqual(['range', [3, 1002]]);
  });

  it('skips the owner lookups entirely when there are no test accounts', async () => {
    const { admin, calls } = fakeAdmin({
      award_votes: [{ data: [voteRow('best_lab', 'lab', 'lab-1', 'r1')] }, { data: [] }],
    });
    expect(await loadOrganicAwardTally(admin, '2026-Q3', new Set())).toEqual([
      row('best_lab', 'lab-1', 1, 'lab'),
    ]);
    expect(calls.map((c) => c.table)).toEqual(['award_votes', 'award_votes']);
  });
});

describe('publishAwardResults — test accounts never decide a result', () => {
  it('publishes the real winners, never the RPC, and the evidence count ignores test askers', async () => {
    const REAL_X = 'real-x';
    const REAL_Y = 'real-y';
    const { admin, rpc, opsOf, calls } = fakeAdmin({
      award_cycles: [
        {
          data: {
            quarter: '2026-Q2',
            opens_at: '2026-04-01T00:00:00.000Z',
            closes_at: '2026-07-01T00:00:00.000Z',
            published_at: null,
          },
        },
        { data: { quarter: '2026-Q2' } }, // the claim — this caller won
        {}, // the anchor-post link
      ],
      users: [{ data: [{ id: T1 }, { id: T2 }, { id: T3 }] }],
      award_votes: [
        {
          data: [
            // most_helpful: four real votes FOR a test member, two for real-x.
            ...['r1', 'r2', 'r3', 'r4'].map((v) => voteRow('most_helpful', 'user', T1, v)),
            ...['r5', 'r6'].map((v) => voteRow('most_helpful', 'user', REAL_X, v)),
            // rising_builder: three votes BY test accounts, one real vote.
            ...[T1, T2, T3].map((v) => voteRow('rising_builder', 'user', 'real-z', v)),
            voteRow('rising_builder', 'user', REAL_Y, 'r1'),
          ],
        },
        { data: [] },
      ],
      profiles: [{ data: { display_name: 'Real X' } }, { data: { display_name: 'Real Y' } }],
      posts: [{ count: 4 }], // most_helpful evidence head-count
      award_results: [{}, {}],
    });

    const result = await publishAwardResults(admin, '2026-Q2', createTranslator('so'));

    expect(result).toEqual({
      postIds: ['post:award:2026-Q2:most_helpful', 'post:award:2026-Q2:rising_builder'],
    });
    expect(rpc).not.toHaveBeenCalled();

    const upserts = calls
      .filter((c) => c.table === 'award_results')
      .map((c) => c.ops.find(([op]) => op === 'upsert')?.[1][0] as Record<string, unknown>);
    expect(upserts).toEqual([
      expect.objectContaining({
        category: 'most_helpful',
        target_id: REAL_X,
        votes: 2,
        evidence: { asksResolved: 4 },
      }),
      expect.objectContaining({ category: 'rising_builder', target_id: REAL_Y, votes: 1 }),
    ]);
    expect(JSON.stringify(upserts)).not.toContain(T1);
    expect(JSON.stringify(upserts)).not.toContain('real-z');

    // The asker-confirmed evidence line never counts an Ask a test account posted.
    expect(opsOf('posts')).toContainEqual(['not', ['author_user_id', 'in', `(${T1},${T2},${T3})`]]);
  });
});
