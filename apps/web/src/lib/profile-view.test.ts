import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test-account quarantine (users.is_test, 20260912050000) on the profile
 * projections behind /u/[handle], /profile, the OpenGraph image and
 * GET /api/profiles/[handle]. A seeded/test account is not a real member: no
 * public projection at all, a stripped identity-only projection for members,
 * and no weight in a real member's follower or vouch count.
 */

type Row = Record<string, unknown>;
type Call = { op: string; args: unknown[] };
interface Seed {
  row?: Row | null;
  rows?: Row[];
  count?: number;
  /** A count that depends on the recorded filters — emulates PostgREST `not in`. */
  countFor?: (calls: Call[]) => number;
}

/**
 * Any client (service role or a caller's RLS client): every builder method
 * chains and is recorded per query; awaiting a query resolves its seed.
 */
class FakeAdmin {
  readonly tables: string[] = [];
  readonly queries: Array<{ table: string; calls: Call[] }> = [];
  constructor(private readonly seeds: Record<string, Seed[]>) {}
  from(table: string) {
    this.tables.push(table);
    const seed = this.seeds[table]?.shift() ?? { rows: [] };
    const calls: Call[] = [];
    this.queries.push({ table, calls });
    const target = {
      then<T1, T2>(
        onfulfilled?:
          | ((v: { data: unknown; error: null; count: number | null }) => T1 | PromiseLike<T1>)
          | null,
        onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
      ) {
        return Promise.resolve({
          data: seed.rows ?? seed.row ?? null,
          error: null,
          count: seed.countFor ? seed.countFor(calls) : (seed.count ?? null),
        }).then(onfulfilled, onrejected);
      },
    };
    const proxy: unknown = new Proxy(target, {
      get(t, prop) {
        if (prop in t) return (t as Record<PropertyKey, unknown>)[prop];
        return (...args: unknown[]) => {
          calls.push({ op: String(prop), args });
          return proxy;
        };
      },
    });
    return proxy;
  }
  callsOf(table: string, nth = 0): Call[] {
    const hit = this.queries.filter((query) => query.table === table)[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.calls;
  }
}

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => adminHolder.client }));

import { getMemberProfileView, getPublicProfileView, isTestAccountHandle } from './profile-view';

const PROFILE: Row = {
  user_id: 'u-1',
  display_name: 'Hodan',
  handle: 'hodan',
  bio: null,
  location_city: null,
  location_country: null,
  skills: [],
  lanes: [],
  verification_status: 'unverified',
  created_at: '2026-01-01T00:00:00Z',
  avatar_path: null,
  avatar_blurhash: null,
  cover_path: null,
  cover_blurhash: null,
};

const TEST_A = '99999999-9999-4999-8999-99999999999a';
const TEST_B = '99999999-9999-4999-8999-99999999999b';

/** A fixture persona as the seeder left it: verified, bio'd, skilled. */
const FIXTURE: Row = {
  ...PROFILE,
  display_name: 'Ayaan Dev',
  handle: 'ayaan_dev',
  bio: 'Senior engineer',
  location_city: 'Hargeisa',
  location_country: 'Somaliland',
  skills: ['react'],
  lanes: ['tech'],
  links: [{ label: 'GitHub', url: 'https://github.com/ayaan' }],
  contact_options: { email: 'ayaan@example.com' },
  verification_status: 'identity_verified',
  avatar_path: 'u/ayaan.webp',
};

function flagsRow(isTest: boolean, status = 'active'): Row {
  return { id: 'u-1', status, is_ai: false, is_test: isTest };
}

/** `not(column, 'in', list)` recorded on a query, if any. */
function excluded(calls: Call[], column: string): string | undefined {
  const hit = calls.find((call) => call.op === 'not' && call.args[0] === column);
  return hit && hit.args[1] === 'in' ? String(hit.args[2]) : undefined;
}

beforeEach(() => {
  adminHolder.client = null;
});

describe('test-account quarantine', () => {
  it('getPublicProfileView returns null for a test account — anon 404, brand OG card', async () => {
    const admin = new FakeAdmin({
      profiles: [{ row: FIXTURE }],
      users: [{ rows: [flagsRow(true)] }],
    });
    adminHolder.client = admin;
    expect(await getPublicProfileView('ayaan_dev')).toBeNull();
    // Nothing beyond the profile row and the flags lookup: no badges, counts,
    // reputation, open-to or settings are read for a test account.
    expect(admin.tables).toEqual(['profiles', 'users']);
  });

  it('getMemberProfileView strips a test account to identity only (owner or not), reading nothing else', async () => {
    for (const viewerId of ['someone-else', 'u-1']) {
      const admin = new FakeAdmin({ users: [{ rows: [flagsRow(true)] }] });
      const caller = new FakeAdmin({ profiles: [{ row: FIXTURE }] });
      adminHolder.client = admin;

      const view = await getMemberProfileView(caller as never, 'ayaan_dev', viewerId);

      expect(view?.isTest).toBe(true);
      expect(view?.profile).toEqual({
        user_id: 'u-1',
        display_name: 'Ayaan Dev',
        handle: 'ayaan_dev',
        bio: null,
        location_city: null,
        location_country: null,
        skills: [],
        lanes: [],
        verification_status: 'unverified',
        created_at: '2026-01-01T00:00:00Z',
      });
      expect(view?.badges).toEqual([]);
      expect(view?.counts).toEqual({ followers: 0, vouches: 0 });
      expect(view?.reputation).toEqual({ contribution: 0, helper: 0 });
      expect(view?.openTo).toEqual([]);
      expect(view?.pins).toEqual([]);
      expect(view?.media.avatarUrl).toBeNull();
      const json = JSON.stringify(view);
      for (const leak of ['identity_verified', 'Senior engineer', 'Hargeisa', 'github', 'ayaan@']) {
        expect(json).not.toContain(leak);
      }
      // Not fetched-then-dropped: no badge, reputation, open-to, pin or
      // count read happened for the test account.
      expect(caller.tables).toEqual(['profiles']);
      expect(admin.tables).toEqual(['users']);
    }
  });

  it('a real account keeps its full projection, marked isTest: false', async () => {
    const admin = new FakeAdmin({
      profiles: [{ row: { ...FIXTURE, handle: 'real_member' } }],
      users: [{ rows: [flagsRow(false)] }, { rows: [] }],
      user_settings: [{ row: { location_granularity: 'city', discoverable_search_engines: true } }],
    });
    adminHolder.client = admin;

    const view = await getPublicProfileView('real_member');

    expect(view?.isTest).toBe(false);
    expect(view?.profile.verification_status).toBe('identity_verified');
    expect(view?.profile.bio).toBe('Senior engineer');
  });

  it('member view of a REAL profile: follower and vouch counts leave test actors out', async () => {
    const admin = new FakeAdmin({
      users: [{ rows: [flagsRow(false)] }, { rows: [{ id: TEST_A }, { id: TEST_B }] }],
      // Five follows / three vouches on file; two follows and one vouch are
      // from test accounts. The count drops them only when the query asks.
      follows: [{ countFor: (calls) => (excluded(calls, 'follower_user_id') ? 3 : 5) }],
      vouches: [{ countFor: (calls) => (excluded(calls, 'voucher_user_id') ? 2 : 3) }],
      user_settings: [{ row: { location_granularity: 'city', discoverable_search_engines: true } }],
    });
    const caller = new FakeAdmin({ profiles: [{ row: PROFILE }] });
    adminHolder.client = admin;

    const view = await getMemberProfileView(caller as never, 'hodan', 'someone-else');

    expect(view?.isTest).toBe(false);
    expect(view?.counts).toEqual({ followers: 3, vouches: 2 });
    const list = `(${TEST_A},${TEST_B})`;
    expect(excluded(admin.callsOf('follows'), 'follower_user_id')).toBe(list);
    expect(excluded(admin.callsOf('vouches'), 'voucher_user_id')).toBe(list);
  });

  it('public view of a REAL profile: the same exclusion applies to its counts', async () => {
    const admin = new FakeAdmin({
      profiles: [{ row: PROFILE }],
      users: [{ rows: [flagsRow(false)] }, { rows: [{ id: TEST_A }] }],
      follows: [{ countFor: (calls) => (excluded(calls, 'follower_user_id') ? 1 : 4) }],
      vouches: [{ countFor: (calls) => (excluded(calls, 'voucher_user_id') ? 0 : 1) }],
      user_settings: [{ row: { location_granularity: 'city', discoverable_search_engines: true } }],
    });
    adminHolder.client = admin;

    const view = await getPublicProfileView('hodan');

    expect(view?.isTest).toBe(false);
    expect(view?.counts).toEqual({ followers: 1, vouches: 0 });
  });

  it('with no test accounts at all, the counts are unfiltered (no empty `in ()` list)', async () => {
    const admin = new FakeAdmin({
      profiles: [{ row: PROFILE }],
      users: [{ rows: [flagsRow(false)] }, { rows: [] }],
      follows: [{ count: 4 }],
      vouches: [{ count: 1 }],
      user_settings: [{ row: { location_granularity: 'city', discoverable_search_engines: true } }],
    });
    adminHolder.client = admin;

    const view = await getPublicProfileView('hodan');

    expect(view?.counts).toEqual({ followers: 4, vouches: 1 });
    expect(admin.callsOf('follows').some((call) => call.op === 'not')).toBe(false);
    expect(admin.callsOf('vouches').some((call) => call.op === 'not')).toBe(false);
  });

  it('isTestAccountHandle answers from the service role: test → true, real / unknown → false', async () => {
    adminHolder.client = new FakeAdmin({
      profiles: [{ row: { user_id: 'u-1' } }],
      users: [{ rows: [flagsRow(true)] }],
    });
    expect(await isTestAccountHandle('ayaan_dev')).toBe(true);

    adminHolder.client = new FakeAdmin({
      profiles: [{ row: { user_id: 'u-1' } }],
      users: [{ rows: [flagsRow(false)] }],
    });
    expect(await isTestAccountHandle('hodan')).toBe(false);

    adminHolder.client = new FakeAdmin({ profiles: [{ row: null }] });
    expect(await isTestAccountHandle('nobody')).toBe(false);
  });

  it('a flags lookup failure throws rather than projecting (the migration must come first)', async () => {
    const failingUsers = {
      from: (table: string) => {
        if (table === 'profiles') {
          return new FakeAdmin({ profiles: [{ row: FIXTURE }] }).from('profiles');
        }
        return {
          select: () => ({
            in: async () => ({
              data: null,
              error: { message: 'column users.is_test does not exist' },
            }),
          }),
        };
      },
    };
    adminHolder.client = failingUsers;
    await expect(getPublicProfileView('ayaan_dev')).rejects.toThrow(/account flags lookup failed/);
  });
});
