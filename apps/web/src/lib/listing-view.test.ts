import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import {
  LISTING_COLUMNS,
  getMemberListingView,
  getPublicListingView,
} from './listing-view';

/**
 * Listing projection safety (extras item 5 acceptance). getPublicListingView
 * is a service-role read — RLS is bypassed, so THIS module's `status =
 * 'published'` filter and its narrow column list are the only things standing
 * between an anonymous visitor and draft/removed listings or internal
 * columns. Same fake-client technique as search-view.test.ts: the fake
 * records each query's filter chain, so assertions on the recorded chain
 * prove the DB-side gate was requested, and seeding admin vs caller clients
 * separately proves which client a query rode.
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
  order(column: string, options?: unknown) {
    return this.chain('order', [column, options]);
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.recorded.push({ op: 'maybeSingle', args: [] });
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
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
  queryCount(table: string): number {
    return this.calls.filter((call) => call.table === table).length;
  }
}

type AnyClient = SupabaseClient<Database>;

/** The service-role client getPublicListingView reaches for; swapped per test. */
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));

const LISTING_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';

function publishedListing(overrides: Row = {}): Row {
  return {
    id: LISTING_ID,
    owner_user_id: OWNER_ID,
    business_name: 'Hodan Café',
    category_id: '44444444-4444-4444-8444-444444444444',
    short_description: null,
    address: null,
    landmark: null,
    latitude: null,
    longitude: null,
    city: 'Hargeisa',
    country: 'Somaliland',
    contact_links: [],
    verification_status: 'verified',
    status: 'published',
    source: 'member',
    created_at: '2026-07-01T00:00:00Z',
    opening_hours: null,
    price_range: 2,
    primary_photo_path: null,
    primary_photo_blurhash: null,
    primary_photo_alt: null,
    photo_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  adminHolder.client = null;
});

describe('LISTING_COLUMNS (the anonymous projection)', () => {
  it('never includes internal/derived columns', () => {
    const columns = LISTING_COLUMNS.split(',').map((column) => column.trim());
    for (const internal of ['export_checklist', 'export_readiness_score', 'updated_at']) {
      expect(columns).not.toContain(internal);
    }
  });

  it('keeps contact_links public on purpose (§18 contact policy)', () => {
    // A listing exists to be contacted — this pin documents that including
    // contact_links anonymously is a decision, not an oversight.
    expect(LISTING_COLUMNS).toContain('contact_links');
  });
});

describe('getPublicListingView — anonymous (service-role projection)', () => {
  it('requests the published gate and the narrow column list on the admin client', async () => {
    const admin = new FakeClient({
      business_listings: [[publishedListing()]],
    });
    adminHolder.client = admin;

    const view = await getPublicListingView(LISTING_ID);

    const listingQuery = admin.queryFor('business_listings');
    expect(listingQuery.has('eq', ['status', 'published'])).toBe(true);
    expect(listingQuery.has('eq', ['id', LISTING_ID])).toBe(true);
    expect(listingQuery.selectedColumns()).toBe(LISTING_COLUMNS);
    expect(view?.listing.id).toBe(LISTING_ID);
  });

  it('returns null when the published filter yields no row (draft/removed)', async () => {
    // The fake models the DB honouring eq('status','published') on a draft:
    // zero rows come back, and the module must translate that to null — not
    // fall back to a laxer query.
    const admin = new FakeClient({ business_listings: [[]] });
    adminHolder.client = admin;

    const view = await getPublicListingView(LISTING_ID);

    expect(view).toBeNull();
    // No decoration fetches fire for a listing that failed the gate.
    expect(admin.queryCount('listing_photos')).toBe(0);
    expect(admin.queryCount('listing_services')).toBe(0);
    expect(admin.queryCount('profiles')).toBe(0);
  });

  it('scopes every decoration fetch to the gated listing id', async () => {
    const admin = new FakeClient({
      business_listings: [[publishedListing()]],
      listing_photos: [
        [
          {
            media_upload_id: 'm-1',
            storage_path: 'u/a.webp',
            thumb_path: 'u/a_thumb.webp',
            alt_text: 'front',
            blurhash: null,
            width: 800,
            height: 600,
          },
        ],
      ],
      listing_services: [[{ name: 'Espresso', price_label: '1 USD' }]],
      profiles: [[{ display_name: 'Hodan', handle: 'hodan' }]],
    });
    adminHolder.client = admin;

    const view = await getPublicListingView(LISTING_ID);

    expect(admin.queryFor('listing_photos').has('eq', ['listing_id', LISTING_ID])).toBe(true);
    expect(admin.queryFor('listing_services').has('eq', ['listing_id', LISTING_ID])).toBe(true);
    // The owner join is by the listing's own owner id and projects only the
    // public display pair.
    expect(admin.queryFor('profiles').has('eq', ['user_id', OWNER_ID])).toBe(true);
    expect(admin.queryFor('profiles').selectedColumns()).toBe('display_name, handle');

    expect(view?.services).toEqual([{ name: 'Espresso', priceLabel: '1 USD' }]);
    expect(view?.photos).toHaveLength(1);
    expect(view?.owner).toEqual({ display_name: 'Hodan', handle: 'hodan' });
  });

  it('skips the owner lookup entirely for unclaimed listings', async () => {
    const admin = new FakeClient({
      business_listings: [[publishedListing({ owner_user_id: null })]],
    });
    adminHolder.client = admin;

    const view = await getPublicListingView(LISTING_ID);

    expect(admin.queryCount('profiles')).toBe(0);
    expect(view?.owner).toBeNull();
    // Unclaimed surfacing: the null owner_user_id survives into the view so
    // the page can render its "unclaimed" tag.
    expect(view?.listing.owner_user_id).toBeNull();
  });
});

describe('getMemberListingView — signed-in (caller RLS is the gate)', () => {
  it('rides the caller client without a status filter (own drafts stay visible)', async () => {
    const caller = new FakeClient({
      business_listings: [[publishedListing({ status: 'draft' })]],
    });

    const view = await getMemberListingView(caller as unknown as AnyClient, LISTING_ID);

    const listingQuery = caller.queryFor('business_listings');
    expect(listingQuery.has('eq', ['id', LISTING_ID])).toBe(true);
    // RLS (published + own + mod) decides visibility here — the module must
    // NOT pin published, or owners/mods would lose their own drafts.
    expect(listingQuery.has('eq', ['status', 'published'])).toBe(false);
    expect(listingQuery.selectedColumns()).toBe(LISTING_COLUMNS);
    expect(view?.listing.status).toBe('draft');
  });
});
