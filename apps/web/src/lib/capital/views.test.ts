import { describe, expect, it } from 'vitest';

import { getPublicCandidateView, listCandidates } from './views';

/**
 * Candidates — test-account quarantine (users.is_test, migration
 * 20260912050000). A candidate a quarantined seeded/test account created is
 * fixture data, not a real build-in-public project:
 *
 *   * never publicly projectable — getPublicCandidateView returns null, which
 *     /c/[id] turns into a 404 (and generateMetadata into no metadata) and the
 *     OG route into the neutral brand card;
 *   * never listed — listCandidates (/capital/candidates and GET
 *     /api/candidates) excludes it in the query, before the page limit, so a
 *     page stays full and the keyset cursor stays exact.
 *
 * The fake applies PostgREST semantics (filters → order → limit).
 */

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const orders: Array<{ column: string; ascending: boolean }> = [];
      let limit: number | null = null;
      const run = () => {
        const rows = (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
        rows.sort((a, b) => {
          for (const { column, ascending } of orders) {
            const diff = String(a[column]).localeCompare(String(b[column]));
            if (diff !== 0) return ascending ? diff : -diff;
          }
          return 0;
        });
        return limit === null ? rows : rows.slice(0, limit);
      };
      const query = {
        select: () => query,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), query),
        not: (c: string, op: string, list: string) => {
          if (op !== 'in') throw new Error(`unsupported not.${op}`);
          const ids = list
            .replace(/^\(|\)$/g, '')
            .split(',')
            .filter(Boolean);
          filters.push((r) => !ids.includes(String(r[c])));
          return query;
        },
        order: (c: string, o: { ascending: boolean }) => (
          orders.push({ column: c, ascending: o.ascending }),
          query
        ),
        limit: (n: number) => ((limit = n), query),
        maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(resolve),
      };
      return query;
    },
  };
}

const FIXTURE = 'fixture-user';
const REAL = 'real-user';

function candidate(id: string, creator: string, createdAt: string): Row {
  return {
    id,
    lab_id: 'lab-1',
    co_lab_id: null,
    created_by_user_id: creator,
    name: `Candidate ${id}`,
    one_liner: 'one liner',
    problem: null,
    solution: null,
    traction: null,
    team: null,
    status: 'submitted',
    visibility: 'all_members',
    timeline_public: true,
    submitted_at: createdAt,
    decided_at: null,
    funded_at: null,
    logo_path: null,
    logo_blurhash: null,
    cover_path: null,
    cover_blurhash: null,
    created_at: createdAt,
  };
}

function tables(candidates: Row[]): Record<string, Row[]> {
  return {
    venture_candidates: candidates,
    users: [
      { id: FIXTURE, status: 'active', is_ai: false, is_test: true },
      { id: REAL, status: 'active', is_ai: false, is_test: false },
    ],
    labs: [{ id: 'lab-1', name: 'Burao Makers', slug: 'burao-makers' }],
    profiles: [
      { user_id: FIXTURE, display_name: 'Fixture', handle: 'fixture' },
      { user_id: REAL, display_name: 'Real', handle: 'real' },
    ],
  };
}

describe('getPublicCandidateView — a test-created candidate is never public', () => {
  it('returns null for a public candidate a test account created', async () => {
    const admin = fakeClient(tables([candidate('c-fake', FIXTURE, '2026-09-01')])) as never;
    expect(await getPublicCandidateView(admin, 'c-fake')).toBeNull();
  });

  it('still projects a real member’s public candidate (control), without the creator id', async () => {
    const admin = fakeClient(tables([candidate('c-real', REAL, '2026-09-01')])) as never;
    const view = await getPublicCandidateView(admin, 'c-real');
    expect(view?.name).toBe('Candidate c-real');
    expect(view?.lab?.slug).toBe('burao-makers');
    expect(JSON.stringify(view)).not.toContain(REAL);
  });
});

describe('listCandidates — test-created candidates are never listed', () => {
  const rows = [
    // The newest candidate is a fixture's.
    candidate('c-fake', FIXTURE, '2026-09-10'),
    candidate('c-3', REAL, '2026-09-03'),
    candidate('c-2', REAL, '2026-09-02'),
    candidate('c-1', REAL, '2026-09-01'),
  ];

  it('excludes the fixture candidate before the page limit, so the page stays full', async () => {
    const client = fakeClient(tables(rows));
    const { items, nextCursor } = await listCandidates(client as never, client as never, {
      limit: 3,
    });
    expect(items.map((item) => item.candidate.id)).toEqual(['c-3', 'c-2', 'c-1']);
    // Exactly three real candidates exist: no phantom next page.
    expect(nextCursor).toBeNull();
  });

  it('pages through real candidates only', async () => {
    const client = fakeClient(tables(rows));
    const first = await listCandidates(client as never, client as never, { limit: 2 });
    expect(first.items.map((item) => item.candidate.id)).toEqual(['c-3', 'c-2']);
    expect(first.nextCursor).toEqual({ createdAt: '2026-09-02', id: 'c-2' });
  });
});
