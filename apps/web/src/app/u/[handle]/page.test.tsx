import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

/**
 * /u/[handle] — test-account quarantine (users.is_test, 20260912050000).
 *
 * A seeded/test account is not a real member, so its permalink must never
 * read as a member's profile:
 *
 *   * signed-out and blocked viewers get a 404 (the public projection is null
 *     for a test account, which is also what sends the OG image to the brand
 *     card);
 *   * every signed-in viewer — the account's own owner included — gets the
 *     test-account notice INSTEAD of the profile: no badge (founding-member
 *     included), no verification chip or ring, no counts, no modules, no
 *     follow / message / share / report controls, no hosted events;
 *   * the metadata is noindex/nofollow for every viewer.
 *
 * The projection chain runs as shipped (lib/aniga/view → lib/profile-view →
 * lib/account-flags) over fake clients; only request plumbing and the
 * interactive controls are stubbed — the controls as sentinels, so the
 * real-profile control case can prove the absences are not vacuous.
 */

type Row = Record<string, unknown>;
type Call = { op: string; args: unknown[] };
type Seed = Row[] | ((calls: Call[]) => Row[]);

/** Any Supabase client: every builder call chains and is recorded; awaiting resolves the seed. */
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
  rpc() {
    return Promise.resolve({ data: false, error: null });
  }
}

const h = vi.hoisted(() => ({
  ctx: null as unknown,
  admin: null as unknown,
}));

vi.mock('@/env', () => ({ env: { APP_URL: 'http://localhost:3000' } }));
vi.mock('@/lib/locale', async () => {
  const { createTranslator: translator } = await import('@xidig/i18n');
  return { getT: async () => translator('en'), getLocale: async () => 'en' };
});
vi.mock('@/lib/auth/guards', () => ({ getAuthContext: async () => h.ctx }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => h.admin }));
vi.mock('@/lib/lite/server', async () => {
  const { LITE_BUNDLES } = await import('@/lib/lite/prefs');
  return { getLitePrefs: async () => LITE_BUNDLES.everything };
});
vi.mock('@/lib/dm/service', () => ({ canReceiveDms: () => true }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
// The controls and the hosted-events rail, as sentinels a render can be searched for.
vi.mock('@/components/profile/follow-button', () => ({
  FollowButton: () => createElement('span', null, 'SENTINEL_FOLLOW'),
}));
vi.mock('@/components/messages/start-dm-button', () => ({
  StartDmButton: () => createElement('span', null, 'SENTINEL_DM'),
}));
vi.mock('@/components/share-actions', () => ({
  ShareActions: () => createElement('span', null, 'SENTINEL_SHARE'),
}));
vi.mock('@/components/report-control', () => ({
  ReportControl: () => createElement('span', null, 'SENTINEL_REPORT'),
}));
vi.mock('@/components/events/upcoming-events-section', () => ({
  UpcomingEventsSection: () => createElement('span', null, 'SENTINEL_EVENTS'),
}));

import ProfilePermalinkPage, { generateMetadata } from './page';

const en = createTranslator('en');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
const HANDLE = 'ayaan_dev';

/** A fixture persona as the seeder left it: verified, bio'd, skilled, badged. */
const PROFILE_ROW: Row = {
  user_id: ACCOUNT,
  display_name: 'Ayaan Dev',
  handle: HANDLE,
  bio: 'Senior engineer',
  location_city: 'Hargeisa',
  location_country: 'Somaliland',
  skills: ['react'],
  lanes: ['tech'],
  links: [],
  contact_options: { email: 'ayaan@example.com' },
  verification_status: 'identity_verified',
  created_at: '2026-01-01T00:00:00Z',
  avatar_path: null,
  avatar_blurhash: null,
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

/** Service-role seeds: the account's flags, the quarantined set, and trust data to (not) leak. */
function adminFor(isTest: boolean): FakeClient {
  return new FakeClient({
    profiles: [PROFILE_ROW],
    users: (calls) =>
      calls.some((call) => call.op === 'eq' && call.args[0] === 'is_test')
        ? isTest
          ? [{ id: ACCOUNT }]
          : []
        : [{ id: ACCOUNT, status: 'active', is_ai: false, is_test: isTest }],
    user_badges: [FOUNDING_BADGE],
    follows: Array.from({ length: 128 }, (_, i) => ({ id: `f${i}` })),
    vouches: Array.from({ length: 37 }, (_, i) => ({ id: `v${i}` })),
    reputation_scores: [{ contribution_score: 42, helper_score: 19 }],
    user_settings: [{ location_granularity: 'city', discoverable_search_engines: true }],
  });
}

/** The signed-in viewer's RLS client — the same trust data, readable to members. */
function callerClient(): FakeClient {
  return new FakeClient({
    profiles: [PROFILE_ROW],
    user_badges: [FOUNDING_BADGE],
    reputation_scores: [{ contribution_score: 42, helper_score: 19 }],
    skill_endorsements: [{ endorser_user_id: VIEWER, skill: 'react' }],
  });
}

function signedIn(id: string, status = 'active'): unknown {
  return { user: { id }, appUser: { id, status }, supabase: callerClient() };
}

async function render(): Promise<string> {
  const element = (await ProfilePermalinkPage({
    params: Promise.resolve({ handle: HANDLE }),
  })) as ReactElement;
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'en', children: element }),
  );
  return new Response(stream).text();
}

/** Everything a test account's page must not carry. */
function expectNoProof(html: string): void {
  // Badges — founding-member included — and the verification chip / ring.
  expect(html).not.toContain(en('profile.badgeFoundingMember'));
  expect(html).not.toContain(en('profile.verifStatusIdentity'));
  expect(html).not.toContain(en('profile.verifStatusCommunity'));
  expect(html).not.toContain(en('profile.verifiedRingAria'));
  expect(html).not.toContain('xidig-tag--trust');
  expect(html).not.toContain('xidig-aniga__check');
  expect(html).not.toContain('xidig-aniga__avatar--verified');
  // Counts, reputation, tenure and the module column.
  expect(html).not.toMatch(/\b(128|37|42|19)\b/);
  expect(html).not.toContain('xidig-profile__counts');
  expect(html).not.toContain('data-module');
  expect(html).not.toContain('xidig-aniga__modules');
  // The profile itself: no name, bio, place or contact channel.
  expect(html).not.toContain('Ayaan Dev');
  expect(html).not.toContain('Senior engineer');
  expect(html).not.toContain('Hargeisa');
  expect(html).not.toContain('ayaan@example.com');
  // No controls and no hosted events.
  expect(html).not.toContain('SENTINEL_');
}

function expectNotice(html: string): void {
  expect(html).toContain(en('profile.testAccountTitle'));
  expect(html).toContain(en('profile.testAccountBody').slice(0, 40));
  // The chip reuses the AI-chip treatment, with the explanatory tooltip.
  expect(html).toContain('xidig-tag xidig-tag--seeded');
  expect(html).toContain(`title="${en('content.testAccountTooltip')}"`);
  expect(html).toContain(`>${en('content.testAccount')}</span>`);
}

beforeEach(() => {
  h.ctx = null;
  h.admin = null;
});

describe('/u/[handle] for a test account', () => {
  it('404s for a signed-out visitor', async () => {
    h.admin = adminFor(true);
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it.each(['suspended', 'deactivated', 'deleted'])(
    '404s for a blocked (%s) viewer — they get the public projection',
    async (status) => {
      h.admin = adminFor(true);
      h.ctx = signedIn(VIEWER, status);
      await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it('shows a signed-in member the test-account notice and nothing of the profile', async () => {
    h.admin = adminFor(true);
    h.ctx = signedIn(VIEWER);

    const html = await render();

    expectNotice(html);
    expectNoProof(html);
  });

  it('shows the account’s own owner the same notice', async () => {
    h.admin = adminFor(true);
    h.ctx = signedIn(ACCOUNT);

    const html = await render();

    expectNotice(html);
    expectNoProof(html);
    // No owner chrome either: no edit link, no completion meter.
    expect(html).not.toContain('/settings/profile');
  });

  it('metadata is noindex/nofollow for every viewer, and names no one', async () => {
    h.admin = adminFor(true);
    const meta = await generateMetadata({ params: Promise.resolve({ handle: HANDLE }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe(en('profile.testAccountTitle'));
    expect(JSON.stringify(meta)).not.toContain('Ayaan Dev');
  });
});

describe('/u/[handle] for a real account — the control case', () => {
  it('renders the profile, its chips and the controls (so the absences above are not vacuous)', async () => {
    h.admin = adminFor(false);
    h.ctx = signedIn(VIEWER);

    const html = await render();

    expect(html).toContain('Ayaan Dev');
    expect(html).toContain(en('profile.badgeFoundingMember'));
    expect(html).toContain(en('profile.verifStatusIdentity'));
    expect(html).toContain('SENTINEL_FOLLOW');
    expect(html).toContain('SENTINEL_EVENTS');
    expect(html).not.toContain(en('profile.testAccountTitle'));
  });

  it('shows a real owner their counts and owner chrome (the owner-notice absences are not vacuous)', async () => {
    h.admin = adminFor(false);
    h.ctx = signedIn(ACCOUNT);

    const html = await render();

    expect(html).toContain(en('profile.followersCount', { count: 128 }));
    expect(html).toContain(en('profile.vouchesCount', { count: 37 }));
    expect(html).toContain('/settings/profile');
    expect(html).toContain('xidig-aniga__check');
  });

  it('metadata is indexable (no robots rule) for a real, discoverable account', async () => {
    h.admin = adminFor(false);
    const meta = await generateMetadata({ params: Promise.resolve({ handle: HANDLE }) });
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toBe(`Ayaan Dev (@${HANDLE})`);
  });
});
