import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/profiles/[handle] — mobile/API parity with the /u/ page for a
 * quarantined test account (users.is_test).
 *
 * Chosen shape: NOT a 404 (the page shows signed-in members a notice, not a
 * missing page) but the same minimal representation the page renders that
 * notice from — `isTest: true`, identity only, every trust-bearing field
 * empty. A client that ignores `isTest` still receives nothing that reads as
 * community proof. lib/profile-view runs as shipped over fake clients.
 */

type Row = Record<string, unknown>;
type Call = { op: string; args: unknown[] };
type Seed = Row[] | ((calls: Call[]) => Row[]);

class FakeClient {
  readonly tables: string[] = [];
  constructor(private readonly seeds: Record<string, Seed> = {}) {}
  from(table: string) {
    this.tables.push(table);
    const seed = this.seeds[table] ?? [];
    const calls: Call[] = [];
    const resolve = () => {
      const rows = typeof seed === 'function' ? seed(calls) : seed;
      const single = calls.some((call) => call.op === 'maybeSingle');
      return { data: single ? (rows[0] ?? null) : rows, error: null, count: rows.length };
    };
    const target = {
      then<T1, T2>(
        onfulfilled?: ((v: ReturnType<typeof resolve>) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
      ) {
        return Promise.resolve(resolve()).then(onfulfilled, onrejected);
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
}

const h = vi.hoisted(() => ({ caller: null as unknown, admin: null as unknown }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({
    user: { id: 'viewer' },
    appUser: { id: 'viewer', status: 'active' },
    supabase: h.caller,
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => h.admin }));
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en') };
});
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { GET } from './route';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const PROFILE_ROW: Row = {
  user_id: ACCOUNT,
  display_name: 'Ayaan Dev',
  handle: 'ayaan_dev',
  bio: 'Senior engineer',
  location_city: 'Hargeisa',
  location_country: 'Somaliland',
  latitude: 9.56,
  longitude: 44.06,
  timezone: 'Africa/Mogadishu',
  skills: ['react'],
  lanes: ['tech'],
  links: [{ label: 'GitHub', url: 'https://github.com/ayaan' }],
  contact_options: { email: 'ayaan@example.com' },
  verification_status: 'identity_verified',
  created_at: '2026-01-01T00:00:00Z',
  avatar_path: 'u/ayaan.webp',
  avatar_blurhash: 'LKO2',
  cover_path: null,
  cover_blurhash: null,
};

const FOUNDING_BADGE: Row = {
  badge_id: 'b-founding',
  awarded_at: '2026-01-02T00:00:00Z',
  context: null,
  tier: null,
  badge_definitions: {
    slug: 'founding-member',
    name: 'Founding Member',
    description: null,
    badge_class: 'tenure',
  },
};

function seed(isTest: boolean): void {
  h.caller = new FakeClient({
    profiles: [PROFILE_ROW],
    user_badges: [FOUNDING_BADGE],
    reputation_scores: [{ contribution_score: 42, helper_score: 19 }],
    profile_open_to: [{ open_to_id: 'collaborators', open_to_kinds: { sort_order: 1 } }],
  });
  h.admin = new FakeClient({
    users: (calls) =>
      calls.some((call) => call.op === 'eq' && call.args[0] === 'is_test')
        ? []
        : [{ id: ACCOUNT, status: 'active', is_ai: false, is_test: isTest }],
    follows: Array.from({ length: 128 }, (_, i) => ({ id: `f${i}` })),
    vouches: Array.from({ length: 37 }, (_, i) => ({ id: `v${i}` })),
    user_settings: [{ location_granularity: 'city', discoverable_search_engines: true }],
  });
}

async function get(): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await GET(new Request('https://app.xidig.net/api/profiles/ayaan_dev'), {
    params: Promise.resolve({ handle: 'ayaan_dev' }),
  });
  return {
    status: res.status,
    data: ((await res.json()) as { data: Record<string, unknown> }).data,
  };
}

beforeEach(() => {
  h.caller = null;
  h.admin = null;
});

describe('GET /api/profiles/[handle] — test-account quarantine', () => {
  it('returns the minimal test-account representation, never the trust-bearing view', async () => {
    seed(true);

    const { status, data } = await get();

    expect(status).toBe(200);
    expect(data).toEqual({
      profile: {
        user_id: ACCOUNT,
        display_name: 'Ayaan Dev',
        handle: 'ayaan_dev',
        bio: null,
        location_city: null,
        location_country: null,
        skills: [],
        lanes: [],
        verification_status: 'unverified',
        created_at: '2026-01-01T00:00:00Z',
      },
      badges: [],
      counts: { followers: 0, vouches: 0 },
      reputation: { contribution: 0, helper: 0 },
      media: {
        avatarUrl: null,
        avatarThumbUrl: null,
        avatarBlurhash: null,
        coverUrl: null,
        coverThumbUrl: null,
        coverBlurhash: null,
      },
      openTo: [],
      pins: [],
      isAi: false,
      isTest: true,
    });
    const json = JSON.stringify(data);
    for (const leak of [
      'identity_verified',
      'founding-member',
      'Senior engineer',
      'Hargeisa',
      'github',
      'ayaan@',
      'Africa/',
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it('control: a real account gets the full view with isTest false', async () => {
    seed(false);

    const { status, data } = await get();

    expect(status).toBe(200);
    expect(data.isTest).toBe(false);
    expect((data.profile as Row).verification_status).toBe('identity_verified');
    expect(data.counts).toEqual({ followers: 128, vouches: 37 });
    expect(JSON.stringify(data.badges)).toContain('founding-member');
  });
});
