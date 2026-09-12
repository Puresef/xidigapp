import { describe, expect, it } from 'vitest';

import { fetchPostCosigns } from './cosigns';

/**
 * "N people support this" — test-account quarantine (users.is_test, migration
 * 20260912050000). A quarantined seeded/test account's support never counts:
 * the exclusion runs inside the head count, so the number is still an
 * aggregate and nobody is enumerated. The viewer's own flag is unaffected.
 *
 * The fake applies the filters it is given (eq / not in) and answers a
 * head-count with the matching row count, as PostgREST does.
 */

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  const heads: Array<{ table: string; not: unknown[] | null }> = [];
  return {
    heads,
    admin: {
      from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let head = false;
        let notArgs: unknown[] | null = null;
        const rows = () =>
          (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
        const query = {
          select: (_cols: string, opts?: { head?: boolean }) => (
            (head = opts?.head === true),
            query
          ),
          eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
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
          maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) => {
            if (head) heads.push({ table, not: notArgs });
            return Promise.resolve(
              head
                ? { data: null, count: rows().length, error: null }
                : { data: rows(), count: null, error: null },
            ).then(resolve);
          },
        };
        return query;
      },
    } as never,
  };
}

const POST = 'post-1';

function db(users: Row[], cosigners: string[]) {
  return fakeAdmin({
    users,
    post_cosigns: cosigners.map((user_id) => ({ post_id: POST, user_id })),
  });
}

describe('fetchPostCosigns — test accounts never count toward support', () => {
  it('excludes test cosigners from the count (a real viewer still sees their own)', async () => {
    const { admin, heads } = db(
      [
        { id: 't1', is_test: true },
        { id: 't2', is_test: true },
        { id: 'r1', is_test: false },
        { id: 'viewer', is_test: false },
      ],
      ['t1', 't2', 'r1', 'viewer'],
    );

    expect(await fetchPostCosigns(admin, POST, 'viewer')).toEqual({ count: 2, mine: true });
    expect(heads).toEqual([{ table: 'post_cosigns', not: ['user_id', 'in', '(t1,t2)'] }]);
  });

  it('a test viewer keeps their own flag, but their support is not in the count', async () => {
    const { admin } = db(
      [
        { id: 't1', is_test: true },
        { id: 'r1', is_test: false },
      ],
      ['t1', 'r1'],
    );
    expect(await fetchPostCosigns(admin, POST, 't1')).toEqual({ count: 1, mine: true });
  });

  it('with no test accounts the count is the plain head count (no filter added)', async () => {
    const { admin, heads } = db([{ id: 'r1', is_test: false }], ['r1']);
    expect(await fetchPostCosigns(admin, POST, 'viewer')).toEqual({ count: 1, mine: false });
    expect(heads).toEqual([{ table: 'post_cosigns', not: null }]);
  });
});
