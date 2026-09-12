import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Community Awards ballot options — test-account quarantine (users.is_test,
 * migration 20260912050000). A quarantined seeded/test account is never on a
 * ballot: no Space it leads, no Win it wrote, no test member among the people
 * the viewer follows. Each exclusion runs in its query BEFORE the limit, so a
 * fixture Space with the latest activity cannot take one of the 25 slots.
 *
 * The fake client applies PostgREST semantics (filters → order → limit); the
 * vote control is stubbed to a plain option list (it is a client component
 * with its own suite) so the rendered labels are exactly the options offered.
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
            const diff = String(a[column]).localeCompare(String(b[column]));
            return ascending ? diff : -diff;
          });
        }
        return limit === null ? rows : rows.slice(0, limit);
      };
      const query = {
        select: () => query,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
        lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), query),
        gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), query),
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
          (orderBy = { column: c, ascending: o.ascending }),
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

const VIEWER = 'viewer';
const FIXTURE = 'fixture-test';

const db = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }));

vi.mock('@/lib/auth/guards', () => ({
  getAuthContext: async () => ({
    appUser: { id: 'viewer', status: 'active' },
    supabase: fakeClient(db.tables),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => fakeClient({ users: db.tables.users ?? [] }),
}));
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en') };
});
vi.mock('@/components/awards/award-vote-control', () => ({
  AwardVoteControl: ({ category, options }: { category: string; options: { label: string }[] }) => (
    <ul data-category={category}>
      {options.map((o) => (
        <li key={o.label}>{o.label}</li>
      ))}
    </ul>
  ),
}));

import AwardsPage from './page';

function user(id: string, isTest = false) {
  return { id, status: 'active', is_ai: false, is_test: isTest };
}

beforeEach(() => {
  const realLabs = Array.from({ length: 25 }, (_, i) => ({
    id: `lab-${i}`,
    name: `Real Lab ${i}`,
    lead_user_id: 'real-lead',
    last_activity_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  db.tables = {
    award_cycles: [
      { quarter: '2026-Q3', opens_at: '2000-01-01T00:00:00Z', closes_at: '2999-01-01T00:00:00Z' },
    ],
    award_votes: [],
    labs: [
      ...realLabs,
      // The most recently active Space is led by a test account.
      {
        id: 'lab-fake',
        name: 'Fixture Lab',
        lead_user_id: FIXTURE,
        last_activity_at: '2026-09-11T00:00:00Z',
      },
    ],
    posts: [
      {
        id: 'win-real',
        title: 'Real Win',
        body: 'b',
        type: 'win',
        status: 'published',
        author_user_id: 'real-author',
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'win-fake',
        title: 'Fixture Win',
        body: 'b',
        type: 'win',
        status: 'published',
        author_user_id: FIXTURE,
        created_at: '2026-09-02T00:00:00Z',
      },
    ],
    follows: [
      { follower_user_id: VIEWER, target_type: 'user', target_id: 'real-friend' },
      { follower_user_id: VIEWER, target_type: 'user', target_id: FIXTURE },
    ],
    profiles: [
      { user_id: 'real-friend', display_name: 'Real Friend', handle: 'real_friend' },
      { user_id: FIXTURE, display_name: 'Fixture Person', handle: 'fixture' },
    ],
    users: [user('real-lead'), user('real-author'), user('real-friend'), user(FIXTURE, true)],
  };
});

describe('/awards ballot — quarantined test accounts are never options', () => {
  it('offers no test-led Space, no test-written Win and no test member', async () => {
    const html = renderToStaticMarkup(await AwardsPage());

    expect(html).toContain('Real Win');
    expect(html).toContain('Real Friend');
    expect(html).not.toContain('Fixture Lab');
    expect(html).not.toContain('Fixture Win');
    expect(html).not.toContain('Fixture Person');
  });

  it('excludes before the limit: all 25 Best Lab slots stay real', async () => {
    const html = renderToStaticMarkup(await AwardsPage());
    const bestLab = html.match(/<ul data-category="best_lab">(.*?)<\/ul>/)?.[1] ?? '';
    expect(bestLab.match(/<li>/g)).toHaveLength(25);
    expect(bestLab).not.toContain('Fixture');
  });
});
