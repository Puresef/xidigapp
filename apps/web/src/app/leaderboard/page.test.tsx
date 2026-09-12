import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Top Helpers leaderboard — test-account quarantine (users.is_test, migration
 * 20260912050000). A seeded/test account never appears or takes a rank, and it
 * is excluded BEFORE the 20-row limit, so a fixture account with the top score
 * cannot push a real member off the list.
 *
 * The fake client below applies PostgREST semantics (filters → order → limit,
 * whatever the call order), so "excluded before the limit" is actually
 * exercised rather than assumed.
 */

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let orderBy: { column: string; ascending: boolean } | null = null;
      let limit: number | null = null;
      const run = () => {
        let rows = (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
        if (orderBy) {
          const { column, ascending } = orderBy;
          rows = [...rows].sort((a, b) => {
            const diff = Number(a[column]) - Number(b[column]);
            return ascending ? diff : -diff;
          });
        }
        return limit === null ? rows : rows.slice(0, limit);
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (filters.push((r) => r[column] === value), query),
        gt: (column: string, value: number) => (
          filters.push((r) => Number(r[column]) > value),
          query
        ),
        in: (column: string, values: unknown[]) => (
          filters.push((r) => values.includes(r[column])),
          query
        ),
        not: (column: string, operator: string, list: string) => {
          if (operator !== 'in') throw new Error(`unsupported not.${operator}`);
          const ids = list
            .replace(/^\(|\)$/g, '')
            .split(',')
            .filter(Boolean);
          filters.push((r) => !ids.includes(String(r[column])));
          return query;
        },
        order: (column: string, opts: { ascending: boolean }) => (
          (orderBy = { column, ascending: opts.ascending }),
          query
        ),
        limit: (n: number) => ((limit = n), query),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(resolve),
      };
      return query;
    },
  };
}

const db = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  scores: [] as Array<Record<string, unknown>>,
  profiles: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/auth/guards', () => ({
  getAuthContext: async () => ({
    appUser: { id: 'viewer', status: 'active' },
    supabase: fakeClient({ reputation_scores: db.scores, profiles: db.profiles }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => fakeClient({ users: db.users }),
}));
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en'), getLocale: async () => 'en' };
});

import LeaderboardPage from './page';

function member(id: string, score: number, opts: { isTest?: boolean; status?: string } = {}) {
  db.users.push({
    id,
    status: opts.status ?? 'active',
    is_ai: false,
    is_test: opts.isTest ?? false,
  });
  db.scores.push({ user_id: id, helper_score: score });
  db.profiles.push({ user_id: id, display_name: `Name ${id}`, handle: `h_${id}` });
}

async function render(): Promise<string> {
  return renderToStaticMarkup(await LeaderboardPage());
}

function rankedHandles(html: string): string[] {
  return [...html.matchAll(/<p class="xidig-card__meta">@(h_[a-z0-9_]+)<\/p>/g)].map((m) => m[1]!);
}

beforeEach(() => {
  db.users.length = 0;
  db.scores.length = 0;
  db.profiles.length = 0;
});

describe('leaderboard — quarantined test accounts never rank', () => {
  it('a test account with the top score does not appear, and 20 real members still fill the list', async () => {
    member('fixture', 999, { isTest: true });
    for (let i = 0; i < 21; i += 1) member(`real${String(i).padStart(2, '0')}`, 100 - i);

    const html = await render();
    const handles = rankedHandles(html);

    expect(handles).not.toContain('h_fixture');
    expect(html).not.toContain('Name fixture');
    // Excluded before the limit: all 20 slots are real members, the top real
    // score ranks #1, and the 21st real member is the one left out.
    expect(handles).toHaveLength(20);
    expect(handles[0]).toBe('h_real00');
    expect(handles).not.toContain('h_real20');
    expect(html).toContain('#1');
  });

  it('a test account in the deletion grace is still excluded; real grace members still rank', async () => {
    member('fixturegrace', 50, { isTest: true, status: 'pending_deletion' });
    member('realgrace', 40, { status: 'pending_deletion' });
    member('real', 30);

    const handles = rankedHandles(await render());
    expect(handles).toEqual(['h_realgrace', 'h_real']);
  });

  it('still drops a deleted account (unchanged retained-content rule)', async () => {
    member('gone', 60, { status: 'deleted' });
    member('real', 30);

    expect(rankedHandles(await render())).toEqual(['h_real']);
  });
});
