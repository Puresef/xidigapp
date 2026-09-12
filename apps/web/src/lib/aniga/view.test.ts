import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createTranslator } from '@xidig/i18n';

import type { Database } from '@xidig/db';

import type { ProfileView } from '@/lib/profile-view';

import { getAnigaView, getPublicAnigaView } from './view';

/**
 * The Aniga projection's job is to decide, per viewer, what may leave the
 * server — so these tests are about ABSENCE as much as presence: the private
 * block, the metrics numbers and the verification nonce must not be in the
 * object a visitor's renderer receives, because a value that never arrives
 * cannot be leaked by a careless branch downstream.
 *
 * Technique follows listing-view.test.ts / search-view.test.ts: a fake client
 * records each query's filter chain and resolves its rows from that chain, so
 * assertions prove WHICH client a read rode and WHICH gate it asked the DB
 * for. Seeding the caller and service-role clients separately is what makes
 * "the token came from the service role, and only for the owner" checkable.
 */

type Row = Record<string, unknown>;
type Seed = Row[] | ((query: FakeQuery) => Row[]);

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null; count: number }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly seed: Seed) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }

  select(columns: string, options?: unknown) {
    return this.chain('select', options === undefined ? [columns] : [columns, options]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  not(column: string, operator: string, value: unknown) {
    return this.chain('not', [column, operator, value]);
  }
  is(column: string, value: unknown) {
    return this.chain('is', [column, value]);
  }
  order(column: string, options?: unknown) {
    return this.chain('order', [column, options]);
  }
  limit(count: number) {
    return this.chain('limit', [count]);
  }

  /** Rows resolve AFTER the chain is complete, so a seed can branch on the filters. */
  private rows(): Row[] {
    return typeof this.seed === 'function' ? this.seed(this) : this.seed;
  }

  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.recorded.push({ op: 'maybeSingle', args: [] });
    return Promise.resolve({ data: this.rows()[0] ?? null, error: null });
  }

  has(op: string, args: unknown[]): boolean {
    return this.recorded.some(
      (entry) => entry.op === op && JSON.stringify(entry.args) === JSON.stringify(args),
    );
  }

  then<TResult1, TResult2>(
    onfulfilled?:
      | ((value: { data: Row[]; error: null; count: number }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const rows = this.rows();
    return Promise.resolve({ data: rows, error: null, count: rows.length }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  readonly rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  constructor(
    private readonly seeds: Record<string, Seed> = {},
    private readonly flags: Record<string, boolean> = {},
  ) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.seeds[table] ?? []);
    this.calls.push({ table, query });
    return query;
  }

  rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    const key = String(args.p_key ?? '');
    return Promise.resolve({ data: this.flags[key] ?? false, error: null });
  }

  queryFor(table: string, nth = 0): FakeQuery {
    const hit = this.calls.filter((call) => call.table === table)[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.query;
  }
  queryCount(table: string): number {
    return this.calls.filter((call) => call.table === table).length;
  }
}

type AnyClient = SupabaseClient<Database>;

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const baseHolder = vi.hoisted(() => ({ view: null as unknown, calls: [] as unknown[][] }));
const publicHolder = vi.hoisted(() => ({ view: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));

// Only the two base projections are stubbed — the rest of lib/profile-view
// (the location-granularity fold the helper rows and the owner facts mirror
// depend on) stays real, so the fold under test is the shipped one.
vi.mock('@/lib/profile-view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/profile-view')>()),
  getMemberProfileView: (...args: unknown[]) => {
    baseHolder.calls.push(args);
    return Promise.resolve(baseHolder.view);
  },
  getPublicProfileView: () => Promise.resolve(publicHolder.view),
}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const VISITOR = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const LAB = '44444444-4444-4444-8444-444444444444';

const t = createTranslator('so');

function baseView(overrides: Partial<ProfileView['profile']> = {}): ProfileView {
  return {
    profile: {
      user_id: OWNER,
      display_name: 'Hodan Cabdi',
      handle: 'hodan',
      bio: null,
      location_city: 'London',
      location_country: 'UK',
      skills: ['React', 'Amniga xogta'],
      lanes: [],
      links: [{ label: 'GitHub', url: 'https://github.com/hodan' }],
      verification_status: 'verified',
      created_at: '2026-01-01T00:00:00Z',
      ...overrides,
    },
    badges: [],
    counts: { followers: 128, vouches: 0 },
    reputation: { contribution: 0, helper: 0 },
    media: {
      avatarUrl: null,
      avatarThumbUrl: null,
      avatarBlurhash: null,
      coverUrl: null,
      coverThumbUrl: null,
      coverBlurhash: null,
    },
    openTo: ['collaborators'],
    pins: [],
    isAi: false,
  } as ProfileView;
}

/** Caller-side seeds every test starts from; each test overrides what it exercises. */
function callerSeeds(overrides: Record<string, Seed> = {}): Record<string, Seed> {
  return {
    profiles: (query) => (query.has('maybeSingle', []) ? [{ headline: 'Injineer software' }] : []),
    profile_modules: [],
    profile_showcase: [],
    skill_endorsements: [],
    profile_link_meta: [],
    lab_skill_needs: [],
    posts: [],
    ...overrides,
  };
}

function adminSeeds(overrides: Record<string, Seed> = {}): Record<string, Seed> {
  return { user_settings: [], posts: [], profile_link_meta: [], lab_members: [], ...overrides };
}

beforeEach(() => {
  adminHolder.client = new FakeClient(adminSeeds());
  baseHolder.view = baseView();
  baseHolder.calls = [];
  publicHolder.view = baseView();
});

describe('getAnigaView — base reuse', () => {
  it('projects on top of getMemberProfileView instead of re-querying the profile', async () => {
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(baseHolder.calls).toHaveLength(1);
    expect(baseHolder.calls[0]).toEqual([caller, 'hodan', OWNER]);
    expect(view?.base).toBe(baseHolder.view);
    // The only `profiles` read this module adds is the headline column, which
    // the base projection's grant list does not carry.
    expect(caller.queryCount('profiles')).toBe(1);
    expect(caller.queryFor('profiles').has('select', ['headline'])).toBe(true);
    expect(view?.headline).toBe('Injineer software');
  });

  it('returns null for an unresolvable handle', async () => {
    baseHolder.view = null;
    const caller = new FakeClient(callerSeeds());

    expect(await getAnigaView(caller as unknown as AnyClient, 'nobody', OWNER)).toBeNull();
  });
});

describe('visitor projection — what must never leave the server', () => {
  it('gives a visitor no private stats and no metrics while the flag is off', async () => {
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.privateStats).toBeNull();
    expect(view?.metrics).toBeNull();
    // Not merely nulled after the fact — the counts were never counted.
    const admin = adminHolder.client as FakeClient;
    expect(admin.calls.filter((call) => call.table === 'posts')).toHaveLength(0);
  });

  it('reads the metrics flag through the RPC, never from the stored module row', async () => {
    // A row that got past the trigger (or predates the flag flip) must not
    // open the module — ruling 7 puts the decision on the platform.
    const caller = new FakeClient(
      callerSeeds({ profile_modules: [{ module_id: 'metrics', position: 8, visible: true }] }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(caller.rpcCalls).toEqual([
      { fn: 'is_feature_enabled', args: { p_key: 'profile_metrics_module' } },
    ]);
    expect(view?.metrics).toBeNull();
    const metrics = view?.modules.find((module) => module.id === 'metrics');
    expect(metrics).toMatchObject({ visible: true, lockedByFlag: true });
  });

  it('gives a visitor metrics ONLY once the platform flag is on', async () => {
    const caller = new FakeClient(callerSeeds(), { profile_metrics_module: true });
    adminHolder.client = new FakeClient(
      adminSeeds({
        posts: (query) =>
          query.has('eq', ['author_user_id', OWNER]) ? [{ id: 'p1' }, { id: 'p2' }] : [{ id: 'p3' }],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.metrics).toEqual({ posts: 2, asksHelped: 1, connections: 128 });
    // Still no owner-private block — the flag governs the module, not the vault.
    expect(view?.privateStats).toBeNull();
  });

  it('gives the owner metrics and the private block even with the flag off', async () => {
    adminHolder.client = new FakeClient(
      adminSeeds({
        posts: (query) => (query.has('eq', ['author_user_id', OWNER]) ? [{ id: 'p1' }] : []),
      }),
    );
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(view?.metrics).toEqual({ posts: 1, asksHelped: 0, connections: 128 });
    expect(view?.privateStats).toEqual({
      posts: 1,
      asksHelped: 0,
      connections: 128,
      // The offline shell (a4) supplies the cache age; a server render is fresh.
      cachedAt: null,
    });
  });

  it('never projects a verification token to a visitor, and never asks for one', async () => {
    const caller = new FakeClient(
      callerSeeds({
        profile_link_meta: [
          {
            url_key: 'github.com/hodan',
            verification_status: 'verified',
            og_status: 'ok',
            og_title: 'hodan',
            og_site_name: 'GitHub',
            og_image_path: null,
          },
        ],
      }),
    );
    adminHolder.client = new FakeClient(
      adminSeeds({
        profile_link_meta: [{ url_key: 'github.com/hodan', verification_token: 'SECRET-NONCE' }],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.links).toHaveLength(1);
    expect(view?.links[0]).toMatchObject({
      urlKey: 'github.com/hodan',
      verificationStatus: 'verified',
      verificationToken: null,
    });
    // The nonce is not fetched-then-dropped: a visitor read never happens.
    expect((adminHolder.client as FakeClient).queryCount('profile_link_meta')).toBe(0);
    expect(JSON.stringify(view)).not.toContain('SECRET-NONCE');
  });

  it('hands the owner their token, and reads it through the service role', async () => {
    // The column grant withholds verification_token from every member client,
    // the owner's included — so a caller-client read would come back empty.
    const caller = new FakeClient(
      callerSeeds({
        profile_link_meta: [
          {
            url_key: 'github.com/hodan',
            verification_status: 'pending',
            og_status: 'failed',
            og_title: null,
            og_site_name: null,
            og_image_path: null,
          },
        ],
      }),
    );
    adminHolder.client = new FakeClient(
      adminSeeds({
        profile_link_meta: [{ url_key: 'github.com/hodan', verification_token: 'SECRET-NONCE' }],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(view?.links[0]?.verificationToken).toBe('SECRET-NONCE');
    expect(view?.links[0]?.ogStatus).toBe('failed');
    const admin = adminHolder.client as FakeClient;
    expect(admin.queryCount('profile_link_meta')).toBe(1);
    expect(admin.queryFor('profile_link_meta').has('eq', ['user_id', OWNER])).toBe(true);
  });

  it('collapses link spellings onto one url_key so one destination has one state', async () => {
    baseHolder.view = baseView({
      links: [
        { label: 'Blog', url: 'http://WWW.hodan.dev/blog/' },
        { label: 'Cilmi', url: 'mailto:hodan@example.com' },
      ],
    });
    const caller = new FakeClient(
      callerSeeds({
        profile_link_meta: [
          {
            url_key: 'hodan.dev/blog',
            verification_status: 'verified',
            og_status: 'ok',
            og_title: 'Qormo',
            og_site_name: 'hodan.dev',
            og_image_path: 'u/og.webp',
          },
        ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.links[0]).toMatchObject({
      urlKey: 'hodan.dev/blog',
      verificationStatus: 'verified',
      ogStatus: 'ok',
      ogTitle: 'Qormo',
    });
    expect(view?.links[0]?.ogImageUrl).toContain('u/og.webp');
    // A URL the normalizer refuses can never carry a sidecar row, so it
    // degrades to a plain unverified chip instead of borrowing someone's.
    expect(view?.links[1]).toMatchObject({
      urlKey: '',
      verificationStatus: 'unverified',
      ogStatus: 'pending',
      verificationToken: null,
    });
  });
});

describe('endorsements — distinct endorsers (A8)', () => {
  it('counts people, not rows', async () => {
    // unique(endorser, endorsee, skill) already forbids the duplicate row
    // below; the projection must not depend on that constraint holding.
    const caller = new FakeClient(
      callerSeeds({
        skill_endorsements: [
          { endorser_user_id: VISITOR, skill: 'React' },
          { endorser_user_id: VISITOR, skill: 'React' },
          { endorser_user_id: OTHER, skill: 'react' },
        ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    // Case is a spelling difference, not a different skill.
    expect(view?.skills[0]).toMatchObject({ skill: 'React', endorsers: 2, rank: 1 });
    expect(caller.queryFor('skill_endorsements').has('eq', ['endorsee_user_id', OWNER])).toBe(true);
  });

  it('ranks by depth and marks only the viewer’s own endorsement', async () => {
    const caller = new FakeClient(
      callerSeeds({
        skill_endorsements: [
          { endorser_user_id: OTHER, skill: 'Amniga xogta' },
          { endorser_user_id: VISITOR, skill: 'Amniga xogta' },
          { endorser_user_id: OTHER, skill: 'React' },
        ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.skills.map((skill) => [skill.skill, skill.endorsers, skill.rank])).toEqual([
      ['Amniga xogta', 2, 1],
      ['React', 1, 2],
    ]);
    expect(view?.skills[0]?.endorsedByViewer).toBe(true);
    expect(view?.skills[1]?.endorsedByViewer).toBe(false);
  });

  it('keeps counts on the visitor view — they are evidence, not popularity', async () => {
    // A1 forbids follower/engagement counts on a visitor's DOM; ANIGA-SPEC
    // §3.2 keeps endorsement depth, and the frames render ×N to visitors.
    const caller = new FakeClient(
      callerSeeds({ skill_endorsements: [{ endorser_user_id: OTHER, skill: 'React' }] }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', null);

    expect(view?.skills[0]?.endorsers).toBe(1);
    // Signed-out has nobody to have endorsed anything.
    expect(view?.skills.every((skill) => !skill.endorsedByViewer)).toBe(true);
  });

  it('renders only skills the member still declares', async () => {
    const caller = new FakeClient(
      callerSeeds({
        skill_endorsements: [
          { endorser_user_id: OTHER, skill: 'React' },
          { endorser_user_id: OTHER, skill: 'Retracted' },
        ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.skills.map((skill) => skill.skill)).toEqual(['React', 'Amniga xogta']);
  });
});

describe('showcase — pinned refs only (A5)', () => {
  const showcaseRows = [
    { position: 1, entity_type: 'post', entity_id: 'win-1', media_id: 'm-1' },
    { position: 2, entity_type: 'post', entity_id: 'upd-1', media_id: null },
    { position: 3, entity_type: 'post', entity_id: 'ask-1', media_id: null },
    { position: 4, entity_type: 'lab', entity_id: 'lab-1', media_id: null },
    { position: 5, entity_type: 'listing', entity_id: 'list-1', media_id: null },
    { position: 6, entity_type: 'post', entity_id: 'hidden-1', media_id: null },
  ];

  function showcaseCaller() {
    return new FakeClient(
      callerSeeds({
        profile_showcase: showcaseRows,
        posts: (query) =>
          query.has('in', ['id', ['win-1', 'upd-1', 'ask-1', 'hidden-1']])
            ? [
                { id: 'win-1', title: 'Guushii koowaad', body: 'b', type: 'win' },
                { id: 'upd-1', title: null, body: 'War cusub', type: 'update' },
                { id: 'ask-1', title: 'Codsi', body: 'b', type: 'ask' },
              ]
            : [],
        labs: [{ id: 'lab-1', name: 'Suuq-Card', slug: 'suuq-card' }],
        business_listings: [{ id: 'list-1', business_name: 'Hodan Café' }],
      }),
    );
  }

  it('maps each source to its chip — Guul is the only orange one', async () => {
    const caller = showcaseCaller();

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.showcase.map((item) => [item.entityId, item.sourceKind])).toEqual([
      ['win-1', 'guul'],
      ['upd-1', 'war'],
      ['ask-1', null],
      ['lab-1', 'warshad'],
      ['list-1', null],
    ]);
  });

  it('drops a tile whose target the viewer cannot read, rather than rendering a dead one', async () => {
    const caller = showcaseCaller();

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.showcase.map((item) => item.entityId)).not.toContain('hidden-1');
    // Hydration rides the CALLER's client, which is what makes RLS the gate.
    expect(caller.queryCount('posts')).toBeGreaterThan(0);
  });

  it('carries permalinks, titles and MediaSlot bytes', async () => {
    adminHolder.client = new FakeClient(
      adminSeeds({
        media_uploads: [
          {
            id: 'm-1',
            storage_path: 'u/win.webp',
            thumb_path: 'u/win_thumb.webp',
            blurhash: 'LKO2',
            bytes: 92160,
          },
        ],
      }),
    );
    const caller = showcaseCaller();

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.showcase[0]).toMatchObject({
      href: '/p/win-1',
      title: 'Guushii koowaad',
      blurhash: 'LKO2',
      estBytes: 92160,
    });
    expect(view?.showcase[0]?.mediaThumbUrl).toContain('u/win_thumb.webp');
    // A post with no title falls back to its body, never to an empty tile.
    expect(view?.showcase[1]?.title).toBe('War cusub');
    expect(view?.showcase[3]?.href).toBe('/labs/suuq-card');
    expect(view?.showcase[4]?.href).toBe('/l/list-1');
    // Byte sizes are own-rows-only under RLS → service role.
    expect((adminHolder.client as FakeClient).queryCount('media_uploads')).toBe(1);
  });
});

describe('looking for — every match carries a reason (§3.4)', () => {
  function matchCaller() {
    return new FakeClient(
      callerSeeds({
        // Stored canonical: lab_skill_needs.skill is btrim(lower()) since
        // migration 20260901000100, same as every other skill surface.
        lab_skill_needs: [{ lab_id: LAB, skill: 'amniga xogta' }],
        labs: [
          {
            id: LAB,
            slug: 'suuq-card',
            name: 'Suuq-Card',
            short_description: null,
            stage: 'build',
          },
        ],
      }),
    );
  }

  it('renders the reason and the composed title from one key each', async () => {
    adminHolder.client = new FakeClient(
      adminSeeds({ lab_members: [{ user_id: OTHER }, { user_id: VISITOR }] }),
    );
    const caller = matchCaller();

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER, t);

    expect(view?.lookingFor.slugs).toEqual(['collaborators']);
    expect(view?.lookingFor.matches).toHaveLength(1);
    const match = view!.lookingFor.matches[0]!;
    expect(match.reason).toBe(t('profile.matchReasonSkill'));
    expect(match.reason.length).toBeGreaterThan(0);
    expect(match.title).toContain('Suuq-Card');
    expect(match.title).toContain('amniga xogta');
    expect(match).toMatchObject({ href: '/labs/suuq-card', memberCount: 2 });
  });

  it('emits nothing at all when it has no translator to state a reason with', async () => {
    const caller = matchCaller();

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    // A match the member cannot audit is worse than no match.
    expect(view?.lookingFor.matches).toEqual([]);
    expect(view?.lookingFor.slugs).toEqual(['collaborators']);
  });

  it('never emits a match with an empty reason', async () => {
    adminHolder.client = new FakeClient(adminSeeds({ lab_members: [{ user_id: OTHER }] }));
    const caller = matchCaller();

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER, t);

    for (const match of view?.lookingFor.matches ?? []) {
      expect(match.reason.trim()).not.toBe('');
      expect(match.title.trim()).not.toBe('');
    }
  });

  it('shows a visitor the tags but not the match rows', async () => {
    // "Ku habboon xirfaddaada" is second-person; on someone else's profile
    // there is no reading of "your skills" that is true.
    const caller = matchCaller();

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR, t);

    expect(view?.lookingFor.slugs).toEqual(['collaborators']);
    expect(view?.lookingFor.matches).toEqual([]);
    expect(caller.queryCount('lab_skill_needs')).toBe(0);
  });
});

describe('helper history — asker-credited only', () => {
  it('asks the DB for the fulfilled-with-helper gate and names the crediting asker', async () => {
    const caller = new FakeClient(
      callerSeeds({
        posts: (query) =>
          query.has('eq', ['ask_helper_user_id', OWNER])
            ? [
                {
                  id: 'ask-9',
                  title: 'Sidee loo sugaa xogta?',
                  body: 'b',
                  author_user_id: OTHER,
                  ask_fulfilled_at: '2026-08-01T10:00:00Z',
                },
              ]
            : [],
        profiles: (query) =>
          query.has('maybeSingle', [])
            ? [{ headline: 'Injineer software' }]
            : [
                {
                  user_id: OTHER,
                  display_name: 'Deeqa Nuur',
                  handle: 'deeqa',
                  avatar_path: 'u/deeqa.webp',
                  location_city: 'Hargeisa',
                  location_country: 'Somaliland',
                },
              ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    const posts = caller.calls.find((call) => call.table === 'posts')!.query;
    expect(posts.has('eq', ['ask_helper_user_id', OWNER])).toBe(true);
    expect(posts.has('eq', ['ask_status', 'fulfilled'])).toBe(true);
    expect(view?.helper).toHaveLength(1);
    expect(view?.helper[0]).toMatchObject({
      postId: 'ask-9',
      title: 'Sidee loo sugaa xogta?',
      resolvedAt: '2026-08-01T10:00:00Z',
    });
    expect(view?.helper[0]?.creditedBy).toMatchObject({
      displayName: 'Deeqa Nuur',
      handle: 'deeqa',
      city: 'Hargeisa',
    });
  });

  it('drops an entry whose crediting asker cannot be resolved', async () => {
    // No asker, no credit — the crediting member IS the evidence.
    const caller = new FakeClient(
      callerSeeds({
        posts: (query) =>
          query.has('eq', ['ask_helper_user_id', OWNER])
            ? [{ id: 'ask-9', title: 'x', body: 'b', author_user_id: OTHER, ask_fulfilled_at: '2026-08-01T10:00:00Z' }]
            : [],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.helper).toEqual([]);
  });

  it('folds the asker’s city through THEIR location granularity', async () => {
    adminHolder.client = new FakeClient(
      adminSeeds({ user_settings: [{ user_id: OTHER, location_granularity: 'hidden' }] }),
    );
    const caller = new FakeClient(
      callerSeeds({
        posts: (query) =>
          query.has('eq', ['ask_helper_user_id', OWNER])
            ? [{ id: 'ask-9', title: 'x', body: 'b', author_user_id: OTHER, ask_fulfilled_at: '2026-08-01T10:00:00Z' }]
            : [],
        profiles: (query) =>
          query.has('maybeSingle', [])
            ? [{ headline: null }]
            : [
                {
                  user_id: OTHER,
                  display_name: 'Deeqa Nuur',
                  handle: 'deeqa',
                  avatar_path: null,
                  location_city: 'Hargeisa',
                  location_country: 'Somaliland',
                },
              ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.helper[0]?.creditedBy.city).toBeNull();
  });
});

describe('mutuals — shared Spaces only, never a contacts upload', () => {
  function mutualsAdmin() {
    return new FakeClient(
      adminSeeds({
        lab_members: (query) => {
          if (query.has('eq', ['user_id', VISITOR])) return [{ lab_id: LAB }];
          if (query.has('eq', ['user_id', OWNER])) return [{ lab_id: LAB }, { lab_id: 'other' }];
          if (query.has('eq', ['lab_id', LAB])) {
            return [
              { user_id: OWNER },
              { user_id: VISITOR },
              { user_id: OTHER },
              { user_id: 'x4' },
              { user_id: 'x5' },
            ];
          }
          return [];
        },
        labs: [{ name: 'Warshadda Ganacsi Yaryar 101' }],
        profiles: [
          { user_id: OTHER, display_name: 'Cali Xasan', handle: 'cali', avatar_path: 'u/c.webp' },
        ],
      }),
    );
  }

  it('computes them from the lab_members intersection, via the service role', async () => {
    adminHolder.client = mutualsAdmin();
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.mutuals?.sharedSpaceName).toBe('Warshadda Ganacsi Yaryar 101');
    // The five members minus the two of them — they are not their own mutuals.
    expect(view?.mutuals?.totalCount).toBe(3);
    expect(view?.mutuals?.members[0]).toMatchObject({ displayName: 'Cali Xasan', handle: 'cali' });
    // Lab membership RLS answers for auth.uid(), so the intersection can only
    // be computed by the service role — and nowhere else does it come from.
    const admin = adminHolder.client as FakeClient;
    expect(admin.queryCount('lab_members')).toBeGreaterThanOrEqual(3);
    expect(caller.queryCount('lab_members')).toBe(0);
    expect(admin.queryCount('follows')).toBe(0);
    expect(admin.queryCount('contacts')).toBe(0);
  });

  it('is null when no Space is shared', async () => {
    adminHolder.client = new FakeClient(
      adminSeeds({
        lab_members: (query) =>
          query.has('eq', ['user_id', VISITOR]) ? [{ lab_id: 'mine-only' }] : [{ lab_id: LAB }],
      }),
    );
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.mutuals).toBeNull();
  });

  it('is null for the owner and for a signed-out reader, with no query fired', async () => {
    adminHolder.client = mutualsAdmin();
    const caller = new FakeClient(callerSeeds());

    const own = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);
    const anon = await getAnigaView(caller as unknown as AnyClient, 'hodan', null);

    expect(own?.mutuals).toBeNull();
    expect(anon?.mutuals).toBeNull();
    expect((adminHolder.client as FakeClient).queryCount('lab_members')).toBe(0);
  });
});

describe('modules', () => {
  it('resolves stored rows over the seed defaults and keeps all eight', async () => {
    const caller = new FakeClient(
      callerSeeds({
        profile_modules: [
          { module_id: 'links', position: 1, visible: true },
          { module_id: 'showcase', position: 3, visible: true },
          { module_id: 'looking_for', position: 4, visible: false },
        ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.modules).toHaveLength(8);
    expect(view?.modules[0]?.id).toBe('links');
    expect(view?.modules.find((module) => module.id === 'looking_for')?.visible).toBe(false);
    expect(caller.queryFor('profile_modules').has('eq', ['user_id', OWNER])).toBe(true);
  });
});

describe('owner facts (Xogta) — owner-only, and mirrored as a visitor sees it', () => {
  const LANE_ROWS = [
    { slug: 'halal-finance', name_en: 'Halal finance', name_so: 'Maaliyad xalaal' },
    { slug: 'logistics', name_en: 'Logistics', name_so: 'Saadka' },
  ];

  function granularity(value: string) {
    return new FakeClient(
      adminSeeds({ user_settings: [{ user_id: OWNER, location_granularity: value }] }),
    );
  }

  it('is null for a member visitor and for a signed-out reader, with no read fired', async () => {
    const caller = new FakeClient(callerSeeds({ lanes: LANE_ROWS }));
    adminHolder.client = granularity('hidden');

    const visitor = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);
    const anon = await getAnigaView(caller as unknown as AnyClient, 'hodan', null);
    const share = await getPublicAnigaView('hodan');

    expect(visitor?.ownerFacts).toBeNull();
    expect(anon?.ownerFacts).toBeNull();
    expect(share?.ownerFacts).toBeNull();
    // Not fetched-then-nulled: a visitor's render never asks for the lanes or
    // the granularity, so the fold state has no path into their payload.
    expect(caller.queryCount('lanes')).toBe(0);
    expect((adminHolder.client as FakeClient).queryCount('user_settings')).toBe(0);
  });

  it('shows the owner the folded place, not the city their own header keeps', async () => {
    const caller = new FakeClient(callerSeeds({ lanes: LANE_ROWS }));
    adminHolder.client = granularity('region');

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(view?.ownerFacts).toMatchObject({ fold: 'region', place: 'UK' });
    // The point of the mirror: the header still says London to its owner, and
    // the card is the only place that says what a visitor gets instead.
    expect(view?.base.profile.location_city).toBe('London');
  });

  it('leaves an owner who hid their location with no place at all', async () => {
    const caller = new FakeClient(callerSeeds({ lanes: LANE_ROWS }));
    adminHolder.client = granularity('hidden');

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(view?.ownerFacts).toMatchObject({ fold: 'hidden', place: null });
  });

  it('has nothing to explain at exact or city — the fold takes nothing away', async () => {
    const caller = new FakeClient(callerSeeds({ lanes: LANE_ROWS }));
    adminHolder.client = granularity('exact');
    const exact = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    adminHolder.client = granularity('city');
    const city = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(exact?.ownerFacts).toMatchObject({ fold: null, place: 'London' });
    expect(city?.ownerFacts).toMatchObject({ fold: null, place: 'London' });
  });

  it('reads the granularity through the service role, never the caller', async () => {
    const caller = new FakeClient(callerSeeds({ lanes: LANE_ROWS }));
    adminHolder.client = granularity('region');

    await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(caller.queryCount('user_settings')).toBe(0);
    expect((adminHolder.client as FakeClient).queryCount('user_settings')).toBe(1);
  });

  it('resolves lanes to catalog labels in the request locale, not raw slugs', async () => {
    baseHolder.view = baseView({ lanes: ['halal-finance', 'logistics'] });
    const caller = new FakeClient(callerSeeds({ lanes: LANE_ROWS }));

    const so = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);
    const en = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER, undefined, 'en');

    expect(so?.ownerFacts?.lanes).toEqual([
      { slug: 'halal-finance', label: 'Maaliyad xalaal' },
      { slug: 'logistics', label: 'Saadka' },
    ]);
    expect(en?.ownerFacts?.lanes[0]).toEqual({ slug: 'halal-finance', label: 'Halal finance' });
    // Active rows only: a retired sector must not come back as a label here.
    expect(caller.queryFor('lanes').has('eq', ['is_active', true])).toBe(true);
  });

  it('renders a slug the catalog no longer carries as itself, rather than dropping it', async () => {
    baseHolder.view = baseView({ lanes: ['logistics', 'qaad-free'] });
    const caller = new FakeClient(callerSeeds({ lanes: LANE_ROWS }));

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(view?.ownerFacts?.lanes).toEqual([
      { slug: 'logistics', label: 'Saadka' },
      { slug: 'qaad-free', label: 'qaad-free' },
    ]);
  });
});

/**
 * Test-account quarantine (users.is_test, 20260912050000). A seeded/test
 * account is not a real member: its own profile projects nothing beyond the
 * stripped base, and on a REAL profile an edge whose other end is a test
 * account is not evidence — not an endorsement, not a Caawimo credit, not a
 * mutual, not an ask helped.
 */
describe('test-account quarantine', () => {
  const TEST_A = '99999999-9999-4999-8999-99999999999a';
  const TEST_B = '99999999-9999-4999-8999-99999999999b';

  /** The `not in` list a query asked PostgREST to exclude on `column`, if any. */
  function notIn(query: FakeQuery, column: string): string[] {
    const hit = query.recorded.find((entry) => entry.op === 'not' && entry.args[0] === column);
    if (!hit || hit.args[1] !== 'in') return [];
    return String(hit.args[2]).replace(/[()]/g, '').split(',').filter(Boolean);
  }

  /** The service role's quarantined set: `users` where is_test = true. */
  function testUsers(ids: string[] = [TEST_A, TEST_B]): Seed {
    return (query) => (query.has('eq', ['is_test', true]) ? ids.map((id) => ({ id })) : []);
  }

  function stripped(): ProfileView {
    return {
      ...baseView({
        bio: null,
        location_city: null,
        location_country: null,
        skills: [],
        lanes: [],
        links: undefined,
        verification_status: 'unverified',
      }),
      counts: { followers: 0, vouches: 0 },
      openTo: [],
      isTest: true,
    } as ProfileView;
  }

  it('a test account’s own profile projects nothing beyond the stripped base — for any viewer', async () => {
    baseHolder.view = stripped();
    for (const viewer of [OWNER, VISITOR, null]) {
      const caller = new FakeClient(
        callerSeeds({ skill_endorsements: [{ endorser_user_id: OTHER, skill: 'React' }] }),
        { profile_metrics_module: true },
      );
      adminHolder.client = new FakeClient(adminSeeds({ users: testUsers([OWNER]) }));

      const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', viewer, t);

      expect(view?.base.isTest).toBe(true);
      expect(view).toMatchObject({
        headline: null,
        modules: [],
        showcase: [],
        skills: [],
        links: [],
        lookingFor: { slugs: [], matches: [] },
        helper: [],
        mutuals: null,
        suuq: null,
        metrics: null,
        privateStats: null,
        ownerFacts: null,
      });
      // Not fetched-then-dropped: no module, skill, helper, link or Suuq read
      // ran for the test account, and no mutuals / metrics read either.
      for (const table of [
        'profiles',
        'profile_modules',
        'profile_showcase',
        'skill_endorsements',
        'profile_link_meta',
        'posts',
        'business_listings',
      ]) {
        expect(caller.queryCount(table)).toBe(0);
      }
      const admin = adminHolder.client as FakeClient;
      expect(admin.queryCount('lab_members')).toBe(0);
      expect(admin.queryCount('posts')).toBe(0);
    }
  });

  it('getPublicAnigaView refuses a test account (null → the anon page 404s)', async () => {
    // getPublicProfileView returns null for a test account (profile-view.test.ts)…
    publicHolder.view = null;
    expect(await getPublicAnigaView('hodan')).toBeNull();
    // …and a base that ever said isTest is refused here too.
    publicHolder.view = stripped();
    expect(await getPublicAnigaView('hodan')).toBeNull();
  });

  it('endorsement depth leaves test endorsers out — member path', async () => {
    adminHolder.client = new FakeClient(adminSeeds({ users: testUsers() }));
    const caller = new FakeClient(
      callerSeeds({
        skill_endorsements: [
          { endorser_user_id: TEST_A, skill: 'Amniga xogta' },
          { endorser_user_id: TEST_B, skill: 'Amniga xogta' },
          { endorser_user_id: TEST_A, skill: 'React' },
          { endorser_user_id: OTHER, skill: 'React' },
        ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    // Two test endorsements would have made "Amniga xogta" the deepest skill;
    // without them it has none, and React (one real endorser) ranks first.
    expect(view?.skills.map((skill) => [skill.skill, skill.endorsers, skill.rank])).toEqual([
      ['React', 1, 1],
      ['Amniga xogta', 0, 2],
    ]);
  });

  it('endorsement depth leaves test endorsers out — public (anon) path', async () => {
    adminHolder.client = new FakeClient(
      adminSeeds({
        users: testUsers(),
        profiles: [{ headline: null }],
        skill_endorsements: [
          { endorser_user_id: TEST_A, skill: 'React' },
          { endorser_user_id: TEST_B, skill: 'React' },
          { endorser_user_id: OTHER, skill: 'React' },
        ],
      }),
    );

    const view = await getPublicAnigaView('hodan');

    expect(view?.skills.find((skill) => skill.skill === 'React')?.endorsers).toBe(1);
  });

  it('a test viewer’s own endorsement still reads as "already endorsed" but adds no depth', async () => {
    adminHolder.client = new FakeClient(adminSeeds({ users: testUsers([VISITOR]) }));
    const caller = new FakeClient(
      callerSeeds({ skill_endorsements: [{ endorser_user_id: VISITOR, skill: 'React' }] }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.skills.find((skill) => skill.skill === 'React')).toMatchObject({
      endorsers: 0,
      endorsedByViewer: true,
    });
  });

  it('Caawimo drops credits from test askers — in the query, and after it', async () => {
    adminHolder.client = new FakeClient(adminSeeds({ users: testUsers() }));
    const caller = new FakeClient(
      callerSeeds({
        // The fake ignores filters, so the test asker's row comes back anyway:
        // the post-filter has to catch it too.
        posts: (query) =>
          query.has('eq', ['ask_helper_user_id', OWNER])
            ? [
                {
                  id: 'ask-t',
                  title: 'Fake ask',
                  body: 'b',
                  author_user_id: TEST_A,
                  ask_fulfilled_at: '2026-08-02T10:00:00Z',
                },
                {
                  id: 'ask-9',
                  title: 'Real ask',
                  body: 'b',
                  author_user_id: OTHER,
                  ask_fulfilled_at: '2026-08-01T10:00:00Z',
                },
              ]
            : [],
        profiles: (query) =>
          query.has('maybeSingle', [])
            ? [{ headline: null }]
            : [
                {
                  user_id: OTHER,
                  display_name: 'Deeqa Nuur',
                  handle: 'deeqa',
                  avatar_path: null,
                  location_city: null,
                  location_country: null,
                },
                {
                  user_id: TEST_A,
                  display_name: 'Ayaan Dev',
                  handle: 'ayaan_dev',
                  avatar_path: null,
                  location_city: null,
                  location_country: null,
                },
              ],
      }),
    );

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    expect(view?.helper.map((entry) => entry.postId)).toEqual(['ask-9']);
    const posts = caller.calls.find((call) => call.table === 'posts')!.query;
    expect(notIn(posts, 'author_user_id')).toEqual([TEST_A, TEST_B]);
    // The test asker's profile is never even asked for.
    const askers = caller.calls
      .filter((call) => call.table === 'profiles')
      .map((call) => call.query)
      .find((query) => query.recorded.some((entry) => entry.op === 'in'));
    expect(askers?.has('in', ['user_id', [OTHER]])).toBe(true);
  });

  it('mutuals leave test accounts out of the strip and the count', async () => {
    const labRows = [OWNER, VISITOR, TEST_A, OTHER, TEST_B, 'x5'].map((user_id) => ({ user_id }));
    adminHolder.client = new FakeClient(
      adminSeeds({
        users: testUsers(),
        lab_members: (query) => {
          if (query.has('eq', ['user_id', VISITOR])) return [{ lab_id: LAB }];
          if (query.has('eq', ['user_id', OWNER])) return [{ lab_id: LAB }];
          if (query.has('eq', ['lab_id', LAB])) {
            // Emulate PostgREST: apply the `not in` the query asked for.
            const out = new Set(notIn(query, 'user_id'));
            return labRows.filter((row) => !out.has(row.user_id));
          }
          return [];
        },
        labs: [{ name: 'Warshadda Ganacsi Yaryar 101' }],
        profiles: (query) =>
          query.has('in', ['user_id', [OTHER, 'x5']])
            ? [
                { user_id: OTHER, display_name: 'Cali Xasan', handle: 'cali', avatar_path: null },
                { user_id: 'x5', display_name: 'Xamda', handle: 'xamda', avatar_path: null },
              ]
            : [
                {
                  user_id: TEST_A,
                  display_name: 'Ayaan Dev',
                  handle: 'ayaan_dev',
                  avatar_path: null,
                },
              ],
      }),
    );
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    // Six members minus the two test accounts minus the two of them.
    expect(view?.mutuals?.totalCount).toBe(2);
    expect(view?.mutuals?.members.map((member) => member.handle)).toEqual(['cali', 'xamda']);
    const admin = adminHolder.client as FakeClient;
    const labQueries = admin.calls
      .filter((call) => call.table === 'lab_members' && call.query.has('eq', ['lab_id', LAB]))
      .map((call) => call.query);
    expect(labQueries).toHaveLength(2);
    for (const query of labQueries) expect(notIn(query, 'user_id')).toEqual([TEST_A, TEST_B]);
  });

  it('a test VIEWER is not subtracted twice from the mutuals count', async () => {
    const labRows = [OWNER, VISITOR, OTHER, 'x4'].map((user_id) => ({ user_id }));
    adminHolder.client = new FakeClient(
      adminSeeds({
        users: testUsers([VISITOR]),
        lab_members: (query) => {
          if (query.has('eq', ['user_id', VISITOR])) return [{ lab_id: LAB }];
          if (query.has('eq', ['user_id', OWNER])) return [{ lab_id: LAB }];
          if (query.has('eq', ['lab_id', LAB])) {
            const out = new Set(notIn(query, 'user_id'));
            return labRows.filter((row) => !out.has(row.user_id));
          }
          return [];
        },
        labs: [{ name: 'Lab' }],
        profiles: [],
      }),
    );
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    // Count without the test viewer = 3 (owner, OTHER, x4); minus the owner = 2.
    expect(view?.mutuals?.totalCount).toBe(2);
  });

  it('metrics: asksHelped leaves out asks posted by test accounts', async () => {
    adminHolder.client = new FakeClient(
      adminSeeds({
        users: testUsers(),
        posts: (query) => {
          if (query.has('eq', ['author_user_id', OWNER])) return [{ id: 'p1' }];
          // Three fulfilled asks credited to the owner; one from a test asker.
          const rows = [{ author: OTHER }, { author: TEST_A }, { author: 'x4' }];
          const out = new Set(notIn(query, 'author_user_id'));
          return rows.filter((row) => !out.has(row.author));
        },
      }),
    );
    const caller = new FakeClient(callerSeeds());

    const view = await getAnigaView(caller as unknown as AnyClient, 'hodan', OWNER);

    expect(view?.metrics).toEqual({ posts: 1, asksHelped: 2, connections: 128 });
    expect(view?.privateStats).toMatchObject({ asksHelped: 2 });
  });

  it('reads the quarantined set ONCE per projection, from the service role', async () => {
    adminHolder.client = new FakeClient(adminSeeds({ users: testUsers() }));
    const caller = new FakeClient(callerSeeds(), { profile_metrics_module: true });

    await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    const admin = adminHolder.client as FakeClient;
    expect(
      admin.calls.filter(
        (call) => call.table === 'users' && call.query.has('eq', ['is_test', true]),
      ),
    ).toHaveLength(1);
    expect(caller.queryCount('users')).toBe(0);
  });

  it('with no test accounts at all, no `not in` filter is sent (an empty list is invalid PostgREST)', async () => {
    adminHolder.client = new FakeClient(adminSeeds({ users: testUsers([]) }));
    const caller = new FakeClient(callerSeeds(), { profile_metrics_module: true });

    await getAnigaView(caller as unknown as AnyClient, 'hodan', VISITOR);

    const everyQuery = [
      ...caller.calls.map((call) => call.query),
      ...(adminHolder.client as FakeClient).calls.map((call) => call.query),
    ];
    expect(everyQuery.some((query) => query.recorded.some((entry) => entry.op === 'not'))).toBe(
      false,
    );
  });
});
