import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * GET /api/listings — bookmark hydration contract (Task 10, directory UX).
 * The route decorates each returned listing with `bookmarked` for the CALLER
 * via ONE batch query over the page's ids (anon never reaches the handler —
 * requireUser 401s first, so there is no anonymous hydration path to test
 * beyond the gate itself). Same fake-client technique as listing-view.test.ts:
 * the fake records each query's filter chain, so assertions prove the batch
 * lookup is user-scoped, listing-typed, and covers exactly the page ids.
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
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  ilike(column: string, pattern: string) {
    return this.chain('ilike', [column, pattern]);
  }
  or(filter: string) {
    return this.chain('or', [filter]);
  }
  gte(column: string, value: unknown) {
    return this.chain('gte', [column, value]);
  }
  lte(column: string, value: unknown) {
    return this.chain('lte', [column, value]);
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
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
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

/** Swapped per test: the AuthContext requireUser resolves (or the throw). */
const authHolder = vi.hoisted(() => ({
  ctx: null as unknown,
  error: null as Error | null,
}));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));

// Locale/analytics/rate-limit ride request scope (cookies, after()) that
// doesn't exist under vitest — stubbed to inert equivalents.
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: () => {},
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: async () => {},
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));

import { GET } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function listingRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    owner_user_id: null,
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
    price_range: null,
    primary_photo_path: null,
    primary_photo_blurhash: null,
    primary_photo_alt: null,
    photo_count: 0,
    ...overrides,
  };
}

function contextFor(client: FakeClient): unknown {
  return {
    user: { id: USER_ID },
    appUser: { id: USER_ID, role: 'member', status: 'active' },
    supabase: client,
  };
}

function getRequest(qs = ''): Request {
  return new Request(`https://xidig.test/api/listings${qs}`);
}

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
});

describe('GET /api/listings — bookmarked hydration', () => {
  it('marks the caller-saved listings true and the rest false via one batch query', async () => {
    const client = new FakeClient({
      business_listings: [[listingRow('L1'), listingRow('L2'), listingRow('L3')]],
      bookmarks: [[{ entity_id: 'L2' }]],
    });
    authHolder.ctx = contextFor(client);

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      data: { listings: Array<{ id: string; bookmarked: boolean }> };
    };

    expect(response.status).toBe(200);
    expect(body.data.listings.map((row) => [row.id, row.bookmarked])).toEqual([
      ['L1', false],
      ['L2', true],
      ['L3', false],
    ]);

    // Exactly ONE extra query, scoped to this caller and entity type.
    expect(client.queryCount('bookmarks')).toBe(1);
    const marks = client.queryFor('bookmarks');
    expect(marks.has('eq', ['user_id', USER_ID])).toBe(true);
    expect(marks.has('eq', ['entity_type', 'listing'])).toBe(true);
    expect(marks.argsOf('in')).toEqual(['entity_id', ['L1', 'L2', 'L3']]);
  });

  it('skips the bookmarks query entirely for an empty page', async () => {
    const client = new FakeClient({ business_listings: [[]] });
    authHolder.ctx = contextFor(client);

    const response = await GET(getRequest());
    const body = (await response.json()) as { data: { listings: unknown[] } };

    expect(response.status).toBe(200);
    expect(body.data.listings).toEqual([]);
    expect(client.queryCount('bookmarks')).toBe(0);
  });

  it('batches over the returned PAGE only — the +1 look-ahead row never leaks in', async () => {
    // limit=2 with 3 rows back: row 3 exists only to signal hasMore and must
    // not appear in the response or the bookmark lookup.
    const client = new FakeClient({
      business_listings: [[listingRow('L1'), listingRow('L2'), listingRow('L3')]],
      bookmarks: [[{ entity_id: 'L1' }]],
    });
    authHolder.ctx = contextFor(client);

    const response = await GET(getRequest('?limit=2'));
    const body = (await response.json()) as {
      data: { listings: Array<{ id: string; bookmarked: boolean }>; nextCursor: string | null };
    };

    expect(body.data.listings.map((row) => row.id)).toEqual(['L1', 'L2']);
    expect(body.data.nextCursor).not.toBeNull();
    expect(client.queryFor('bookmarks').argsOf('in')).toEqual(['entity_id', ['L1', 'L2']]);
  });

  it('signed-out callers hit the member gate (401) — no anonymous hydration path', async () => {
    authHolder.error = new ApiError('session_expired', 401);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
  });
});
