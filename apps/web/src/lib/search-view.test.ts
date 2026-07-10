import { describe, expect, it } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import {
  SEARCH_PEOPLE_PUBLIC_COLUMNS,
  sanitizeTerm,
  searchLabs,
  searchListings,
  searchPeople,
  searchPosts,
  type SearchClients,
} from './search-view';

/**
 * Search projection tests (extras item 3 acceptance): search is the classic
 * RLS leak path, so every entity's visibility gate is pinned here — for
 * anonymous callers (service-role projections where THIS code is the only
 * gate) and for member callers (RLS plus the discovery-only exclusions).
 *
 * The fake records each query's filter chain and returns the seeded rows
 * unfiltered — so an assertion that a tainted seeded row is absent from the
 * output proves the module's own post-fetch gate dropped it, and an assertion
 * on the recorded chain proves the DB-side filter was requested. Which client
 * a query rode (caller RLS vs service role) is proven by seeding them
 * separately.
 */

type Row = Record<string, unknown>;

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly rows: Row[]) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }

  select(columns: string) {
    return this.chain('select', [columns]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  not(column: string, operator: string, value: unknown) {
    return this.chain('not', [column, operator, value]);
  }
  or(pattern: string) {
    return this.chain('or', [pattern]);
  }
  ilike(column: string, pattern: string) {
    return this.chain('ilike', [column, pattern]);
  }
  is(column: string, value: unknown) {
    return this.chain('is', [column, value]);
  }
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  order(column: string, options?: unknown) {
    return this.chain('order', [column, options]);
  }
  limit(count: number) {
    return this.chain('limit', [count]);
  }

  has(op: string, args: unknown[]): boolean {
    return this.recorded.some(
      (entry) => entry.op === op && JSON.stringify(entry.args) === JSON.stringify(args),
    );
  }
  selectedColumns(): string {
    return (this.recorded.find((entry) => entry.op === 'select')?.args[0] as string) ?? '';
  }

  then<TResult1, TResult2>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

/**
 * Seeds are per-table FIFO queues consumed at .from() call time — a table
 * queried twice in one searcher (user_settings: opt-outs, then granularity)
 * seeds two result sets in call order. An unseeded table returns [].
 */
class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Row[][]> = {}) {}

  from(table: string): FakeQuery {
    const rows = this.seeds[table]?.shift() ?? [];
    const query = new FakeQuery(rows);
    this.calls.push({ table, query });
    return query;
  }

  queryFor(table: string, nth = 0): FakeQuery {
    const hits = this.calls.filter((call) => call.table === table);
    const hit = hits[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.query;
  }
  queryCount(table?: string): number {
    return table ? this.calls.filter((call) => call.table === table).length : this.calls.length;
  }
}

type AnyClient = SupabaseClient<Database>;

function clientsOf(member: FakeClient | null, admin: FakeClient): SearchClients {
  return {
    member: member as unknown as AnyClient | null,
    memberUserId: member ? 'caller-1' : null,
    admin: admin as unknown as AnyClient,
  };
}

// --- fixtures -------------------------------------------------------------

function person(id: string, extra: Row = {}): Row {
  return {
    user_id: id,
    display_name: `Person ${id}`,
    handle: `h-${id}`,
    location_city: 'Hargeisa',
    location_country: 'Somaliland',
    verification_status: 'unverified',
    created_at: '2026-07-01T00:00:00Z',
    avatar_path: null,
    avatar_blurhash: null,
    ...extra,
  };
}

function account(id: string, status: string, isAi = false): Row {
  return { id, status, is_ai: isAi };
}

function listing(id: string, ownerId: string | null): Row {
  return {
    id,
    owner_user_id: ownerId,
    business_name: `Biz ${id}`,
    short_description: null,
    city: null,
    country: null,
    price_range: null,
    created_at: '2026-07-01T00:00:00Z',
    primary_photo_path: null,
    primary_photo_blurhash: null,
    primary_photo_alt: null,
  };
}

// --- people -----------------------------------------------------------------

describe('searchPeople — anonymous (service-role projection)', () => {
  it('selects only the narrow public columns — no location, links or contact fields', async () => {
    const admin = new FakeClient({
      profiles: [[person('u1')]],
      users: [[account('u1', 'active')]],
    });
    const results = await searchPeople(clientsOf(null, admin), 'maxamed');

    const columns = admin.queryFor('profiles').selectedColumns();
    expect(columns).toBe(SEARCH_PEOPLE_PUBLIC_COLUMNS);
    expect(columns).not.toContain('location_city');
    expect(columns).not.toContain('location_country');
    expect(columns).not.toContain('contact');
    expect(columns).not.toContain('links');
    // Even if a wider row ever slipped through, the mapper nulls location.
    expect(results).toHaveLength(1);
    expect(results[0]!.locationCity).toBeNull();
    expect(results[0]!.locationCountry).toBeNull();
  });

  it('excludes directory opt-outs server-side', async () => {
    const admin = new FakeClient({
      profiles: [[person('u1')]],
      user_settings: [[{ user_id: 'u-optout' }]],
      users: [[account('u1', 'active')]],
    });
    await searchPeople(clientsOf(null, admin), 'maxamed');
    expect(admin.queryFor('profiles').has('not', ['user_id', 'in', '(u-optout)'])).toBe(true);
  });

  it('drops suspended, deactivated, pending-deletion and deleted accounts', async () => {
    const admin = new FakeClient({
      profiles: [
        [
          person('u-active'),
          person('u-susp'),
          person('u-deact'),
          person('u-pend'),
          person('u-del'),
        ],
      ],
      users: [
        [
          account('u-active', 'active'),
          account('u-susp', 'suspended'),
          account('u-deact', 'deactivated'),
          account('u-pend', 'pending_deletion'),
          account('u-del', 'deleted'),
        ],
      ],
    });
    const results = await searchPeople(clientsOf(null, admin), 'person');
    expect(results.map((row) => row.userId)).toEqual(['u-active']);
  });

  it('drops badged AI-assistant accounts (organic-proof invariant, signed-out surface)', async () => {
    const admin = new FakeClient({
      profiles: [[person('u-human'), person('u-ai')]],
      users: [[account('u-human', 'active'), account('u-ai', 'active', true)]],
    });
    const results = await searchPeople(clientsOf(null, admin), 'person');
    expect(results.map((row) => row.userId)).toEqual(['u-human']);
  });

  it('fails closed when an account row is missing', async () => {
    const admin = new FakeClient({
      profiles: [[person('u-orphan')]],
      users: [[]],
    });
    const results = await searchPeople(clientsOf(null, admin), 'person');
    expect(results).toEqual([]);
  });
});

describe('searchPeople — member (caller RLS + discovery exclusions)', () => {
  it('queries profiles under the CALLER client, never the service role', async () => {
    const member = new FakeClient({ profiles: [[person('u1')]] });
    const admin = new FakeClient({ users: [[account('u1', 'active')]] });
    const results = await searchPeople(clientsOf(member, admin), 'maxamed');

    expect(member.queryCount('profiles')).toBe(1);
    expect(admin.queryCount('profiles')).toBe(0);
    expect(results).toHaveLength(1);
  });

  it('drops non-active accounts for members too (profiles RLS is using(true))', async () => {
    const member = new FakeClient({ profiles: [[person('u1'), person('u-susp')]] });
    const admin = new FakeClient({
      users: [[account('u1', 'active'), account('u-susp', 'suspended')]],
    });
    const results = await searchPeople(clientsOf(member, admin), 'person');
    expect(results.map((row) => row.userId)).toEqual(['u1']);
  });

  it('keeps badged AI assistants for members (§21: badged, not hidden)', async () => {
    const member = new FakeClient({ profiles: [[person('u-ai')]] });
    const admin = new FakeClient({ users: [[account('u-ai', 'active', true)]] });
    const results = await searchPeople(clientsOf(member, admin), 'person');
    expect(results.map((row) => row.userId)).toEqual(['u-ai']);
  });

  it("folds each member's location_granularity before rows leave the server", async () => {
    const member = new FakeClient({
      profiles: [[person('u-city'), person('u-region'), person('u-hidden')]],
    });
    const admin = new FakeClient({
      users: [
        [account('u-city', 'active'), account('u-region', 'active'), account('u-hidden', 'active')],
      ],
      user_settings: [
        [], // opt-out lookup
        [
          { user_id: 'u-region', location_granularity: 'region' },
          { user_id: 'u-hidden', location_granularity: 'hidden' },
        ],
      ],
    });
    const results = await searchPeople(clientsOf(member, admin), 'person');
    const byId = new Map(results.map((row) => [row.userId, row]));
    expect(byId.get('u-city')).toMatchObject({
      locationCity: 'Hargeisa',
      locationCountry: 'Somaliland',
    });
    expect(byId.get('u-region')).toMatchObject({
      locationCity: null,
      locationCountry: 'Somaliland',
    });
    expect(byId.get('u-hidden')).toMatchObject({ locationCity: null, locationCountry: null });
  });
});

// --- listings ---------------------------------------------------------------

describe('searchListings — member', () => {
  it('rides the caller RLS client with the published-only filter', async () => {
    const member = new FakeClient({ business_listings: [[listing('l1', 'u1')]] });
    const admin = new FakeClient();
    const results = await searchListings(clientsOf(member, admin), 'biz');

    expect(member.queryFor('business_listings').has('eq', ['status', 'published'])).toBe(true);
    // Suspended-owner hiding is RLS's job on this path (author_is_active);
    // no service-role fetch happens at all.
    expect(admin.queryCount()).toBe(0);
    expect(results).toHaveLength(1);
  });

  it('does NOT filter source for members (seeded content is visible + badged in-app)', async () => {
    const member = new FakeClient({ business_listings: [[]] });
    const admin = new FakeClient();
    await searchListings(clientsOf(member, admin), 'biz');
    expect(member.queryFor('business_listings').has('eq', ['source', 'member'])).toBe(false);
  });
});

describe('searchListings — anonymous (service-role projection)', () => {
  it('requests published, organic (source=member) rows only', async () => {
    const admin = new FakeClient({ business_listings: [[]] });
    await searchListings(clientsOf(null, admin), 'biz');
    const query = admin.queryFor('business_listings');
    expect(query.has('eq', ['status', 'published'])).toBe(true);
    expect(query.has('eq', ['source', 'member'])).toBe(true);
  });

  it("drops a suspended owner's listing (service role bypasses author_is_active)", async () => {
    const admin = new FakeClient({
      business_listings: [[listing('l-ok', 'u-ok'), listing('l-susp', 'u-susp')]],
      users: [[account('u-ok', 'active'), account('u-susp', 'suspended')]],
    });
    const results = await searchListings(clientsOf(null, admin), 'biz');
    expect(results.map((row) => row.id)).toEqual(['l-ok']);
  });

  it('keeps ownerless (imported) listings, matching the RLS null-owner branch', async () => {
    const admin = new FakeClient({
      business_listings: [[listing('l-imported', null)]],
      users: [[]],
    });
    const results = await searchListings(clientsOf(null, admin), 'biz');
    expect(results.map((row) => row.id)).toEqual(['l-imported']);
  });

  it('fails closed when an owner account row is missing', async () => {
    const admin = new FakeClient({
      business_listings: [[listing('l-orphan', 'u-gone')]],
      users: [[]],
    });
    const results = await searchListings(clientsOf(null, admin), 'biz');
    expect(results).toEqual([]);
  });

  it('caps the group at 5 after the active-owner gate', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => listing(`l${index}`, 'u-ok'));
    const admin = new FakeClient({
      business_listings: [rows],
      users: [[account('u-ok', 'active')]],
    });
    const results = await searchListings(clientsOf(null, admin), 'biz');
    expect(results).toHaveLength(5);
  });
});

// --- labs ---------------------------------------------------------------

describe('searchLabs — anonymous (service-role projection)', () => {
  it('requests public, listed, organic Spaces only', async () => {
    const admin = new FakeClient({ labs: [[]] });
    await searchLabs(clientsOf(null, admin), 'fintech');
    const query = admin.queryFor('labs');
    expect(query.has('eq', ['visibility', 'public'])).toBe(true);
    expect(query.has('eq', ['is_listed', true])).toBe(true);
    expect(query.has('eq', ['source', 'member'])).toBe(true);
  });
});

describe('searchLabs — member (caller RLS + listed-only discovery)', () => {
  it('constrains to listed Spaces when the caller has no memberships', async () => {
    const member = new FakeClient({ labs: [[]] });
    const admin = new FakeClient({ lab_members: [[]] });
    await searchLabs(clientsOf(member, admin), 'fintech');
    expect(member.queryFor('labs').has('eq', ['is_listed', true])).toBe(true);
  });

  it("allows the caller's own unlisted Spaces, and nobody else's", async () => {
    const member = new FakeClient({ labs: [[]] });
    const admin = new FakeClient({ lab_members: [[{ lab_id: 'lab-mine' }]] });
    await searchLabs(clientsOf(member, admin), 'fintech');
    const query = member.queryFor('labs');
    expect(query.has('or', ['is_listed.eq.true,id.in.(lab-mine)'])).toBe(true);
    // The membership scan is scoped to the CALLER, not all members.
    expect(admin.queryFor('lab_members').has('eq', ['user_id', 'caller-1'])).toBe(true);
    expect(admin.queryFor('lab_members').has('eq', ['status', 'active'])).toBe(true);
  });

  it('queries labs under the caller client so can_read_lab RLS applies', async () => {
    const member = new FakeClient({ labs: [[]] });
    const admin = new FakeClient({ lab_members: [[]] });
    await searchLabs(clientsOf(member, admin), 'fintech');
    expect(member.queryCount('labs')).toBe(1);
    expect(admin.queryCount('labs')).toBe(0);
  });
});

// --- posts ---------------------------------------------------------------

describe('searchPosts', () => {
  it('anonymous: returns empty WITHOUT issuing any query (members-only, §28)', async () => {
    const admin = new FakeClient({ posts: [[{ id: 'p-leak' }]] });
    const results = await searchPosts(clientsOf(null, admin), 'topic');
    expect(results).toEqual([]);
    expect(admin.queryCount()).toBe(0);
  });

  it('member: published, non-lab posts under the caller RLS client only', async () => {
    const member = new FakeClient({
      posts: [
        [{ id: 'p1', title: 'Topic one', type: 'update', created_at: '2026-07-01T00:00:00Z' }],
      ],
    });
    const admin = new FakeClient();
    const results = await searchPosts(clientsOf(member, admin), 'topic');

    const query = member.queryFor('posts');
    expect(query.has('eq', ['status', 'published'])).toBe(true);
    expect(query.has('is', ['lab_id', null])).toBe(true);
    expect(admin.queryCount()).toBe(0);
    expect(results.map((row) => row.id)).toEqual(['p1']);
  });
});

// --- helpers ---------------------------------------------------------------

describe('sanitizeTerm', () => {
  it('strips PostgREST pattern metacharacters', () => {
    expect(sanitizeTerm('a%b_c,d(e)f')).toBe('a b c d e f');
  });
});
