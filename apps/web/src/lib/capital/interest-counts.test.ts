import { describe, expect, it } from 'vitest';

import { fetchCandidateInterestCounts } from './interest-counts';

/**
 * The client-bound candidate counts — the one projection behind the interests
 * API and the /c/[id] page.
 *
 *   * Packet B follow-up: help + Show support only. The legacy invest tally
 *     (rows retained under Q2) is not part of any approved capital flow, so it
 *     is never read, let alone returned.
 *   * Test-account quarantine (users.is_test, migration 20260912050000): a
 *     quarantined seeded/test account's help or support never counts. The
 *     exclusion runs inside each head count (`not in` the test ids).
 *
 * The fake applies the filters it is given and answers a head count with the
 * matching row count, as PostgREST does.
 */

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>, opts: { failInterests?: boolean } = {}) {
  const heads: Array<{ filters: Array<[string, unknown]>; not: unknown[] | null }> = [];
  const admin = {
    rpc: () => {
      throw new Error('candidate_interest_counts() counts test accounts — must not be called');
    },
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const eqs: Array<[string, unknown]> = [];
      let head = false;
      let notArgs: unknown[] | null = null;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
      const query = {
        select: (_cols: string, o?: { head?: boolean }) => ((head = o?.head === true), query),
        eq: (c: string, v: unknown) => {
          eqs.push([c, v]);
          filters.push((r) => r[c] === v);
          return query;
        },
        not: (c: string, op: string, list: string) => {
          if (op !== 'in') throw new Error(`unsupported not.${op}`);
          notArgs = [c, op, list];
          const ids = list
            .replace(/^\(|\)$/g, '')
            .split(',')
            .filter(Boolean);
          filters.push((r) => !ids.includes(String(r[c])));
          return query;
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (head) heads.push({ filters: eqs, not: notArgs });
          if (table === 'interests' && opts.failInterests) {
            return Promise.resolve({ data: null, count: null, error: { message: 'boom' } }).then(
              resolve,
            );
          }
          return Promise.resolve(
            head
              ? { data: null, count: rows().length, error: null }
              : { data: rows(), count: null, error: null },
          ).then(resolve);
        },
      };
      return query;
    },
  };
  return { admin: admin as never, heads };
}

const CAND = 'cand-1';

function interest(user_id: string, type: string, candidate_id = CAND): Row {
  return { candidate_id, user_id, type };
}

const USERS: Row[] = [
  { id: 't1', is_test: true },
  { id: 't2', is_test: true },
  { id: 'r1', is_test: false },
  { id: 'r2', is_test: false },
  { id: 'r3', is_test: false },
];

describe('fetchCandidateInterestCounts', () => {
  it('excludes quarantined test accounts from help and support counts', async () => {
    const { admin, heads } = fakeAdmin({
      users: USERS,
      interests: [
        interest('r1', 'help'),
        interest('t1', 'help'),
        interest('r1', 'cosign'),
        interest('r2', 'cosign'),
        interest('t1', 'cosign'),
        interest('t2', 'cosign'),
      ],
    });

    expect(await fetchCandidateInterestCounts(admin, CAND)).toEqual({ help: 1, cosign: 2 });
    for (const head of heads) expect(head.not).toEqual(['user_id', 'in', '(t1,t2)']);
  });

  it('never reads or returns the legacy invest tally', async () => {
    const { admin, heads } = fakeAdmin({
      users: USERS,
      interests: [
        interest('r1', 'help'),
        interest('r2', 'cosign'),
        ...['r1', 'r2', 'r3'].map((u) => interest(u, 'invest')),
      ],
    });

    const counts = await fetchCandidateInterestCounts(admin, CAND);
    expect(counts).toEqual({ help: 1, cosign: 1 });
    expect('invest' in counts).toBe(false);
    expect(JSON.stringify(counts)).not.toMatch(/invest/);
    // Exactly two head counts, one per approved type — never one for invest.
    expect(heads.map((h) => h.filters)).toEqual([
      [
        ['candidate_id', CAND],
        ['type', 'help'],
      ],
      [
        ['candidate_id', CAND],
        ['type', 'cosign'],
      ],
    ]);
  });

  it('counts only this candidate, and adds no filter when there are no test accounts', async () => {
    const { admin, heads } = fakeAdmin({
      users: [{ id: 'r1', is_test: false }],
      interests: [interest('r1', 'help'), interest('r1', 'help', 'other-cand')],
    });
    expect(await fetchCandidateInterestCounts(admin, CAND)).toEqual({ help: 1, cosign: 0 });
    for (const head of heads) expect(head.not).toBeNull();
  });

  it('reads an empty candidate as zeros', async () => {
    const { admin } = fakeAdmin({ users: USERS, interests: [] });
    expect(await fetchCandidateInterestCounts(admin, CAND)).toEqual({ help: 0, cosign: 0 });
  });

  it('throws rather than guess when a count fails', async () => {
    const { admin } = fakeAdmin({ users: USERS, interests: [] }, { failInterests: true });
    await expect(fetchCandidateInterestCounts(admin, CAND)).rejects.toThrow(
      /interest counts failed/,
    );
  });
});
