import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getPublicProfileView — the logged-out, service-role projection behind
 * /u/[handle] for anonymous visitors and behind its OpenGraph image.
 *
 * It bypasses RLS, so the rule that hides a non-active member from members
 * (author_is_active) did not apply to it: a deleted account's tombstone —
 * and, before the scrub was completed, its photograph — rendered to the
 * world at a stable URL. The projection now applies the same rule search
 * does: no live account, no public page. Members still get the neutral
 * tombstone through their RLS read on the member surface.
 */

type Row = Record<string, unknown>;

class FakeAdmin {
  readonly tables: string[] = [];
  constructor(
    private readonly seeds: Record<
      string,
      Array<{ row?: Row | null; rows?: Row[]; count?: number }>
    >,
  ) {}
  from(table: string) {
    this.tables.push(table);
    const seed = this.seeds[table]?.shift() ?? { rows: [] };
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
          count: seed.count ?? null,
        }).then(onfulfilled, onrejected);
      },
    };
    const proxy: unknown = new Proxy(target, {
      get(t, prop) {
        if (prop in t) return (t as Record<PropertyKey, unknown>)[prop];
        return () => proxy;
      },
    });
    return proxy;
  }
}

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => adminHolder.client }));

import { getPublicProfileView } from './profile-view';

const PROFILE: Row = {
  user_id: 'u-1',
  display_name: 'Deleted member',
  handle: 'deleted_0123456789ab',
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

function adminFor(status: string | null) {
  return new FakeAdmin({
    profiles: [{ row: PROFILE }],
    users: [{ rows: status ? [{ id: 'u-1', status, is_ai: false }] : [] }],
    user_settings: [{ row: { location_granularity: 'city', discoverable_search_engines: true } }],
  });
}

beforeEach(() => {
  adminHolder.client = null;
});

describe('getPublicProfileView account-status gate', () => {
  it.each(['deleted', 'suspended', 'deactivated', 'pending_deletion'])(
    'returns null for a %s account (no public page, no OG card)',
    async (status) => {
      const admin = adminFor(status);
      adminHolder.client = admin;
      expect(await getPublicProfileView('deleted_0123456789ab')).toBeNull();
      // Nothing beyond the profile row and the flags lookup is fetched — no
      // badges, counts, open-to chips or settings for a tombstone.
      expect(admin.tables).toEqual(['profiles', 'users']);
    },
  );

  it('returns null when the users row is missing (fail closed)', async () => {
    adminHolder.client = adminFor(null);
    expect(await getPublicProfileView('deleted_0123456789ab')).toBeNull();
  });

  it('serves a live account', async () => {
    adminHolder.client = adminFor('active');
    const view = await getPublicProfileView('deleted_0123456789ab');
    expect(view?.profile.user_id).toBe('u-1');
    expect(view?.isAi).toBe(false);
  });

  it('still returns null for an unknown handle', async () => {
    adminHolder.client = new FakeAdmin({ profiles: [{ row: null }] });
    expect(await getPublicProfileView('nobody')).toBeNull();
  });
});
