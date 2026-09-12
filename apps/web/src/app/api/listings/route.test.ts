import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeCursor } from '@/lib/pagination';

/**
 * GET /api/listings (the /suuq business directory + map) — test-account
 * quarantine (users.is_test, migration 20260912050000). A listing owned by a
 * quarantined seeded/test account is not directory or map proof: it is
 * excluded in the query (so a page still fills), while owner-less (imported,
 * unclaimed) listings stay. The fake records each query's filter chain, so
 * the assertions prove the exact filter the route sent.
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

  then<TResult1, TResult2>(
    onfulfilled?:
      ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
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
}

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));

/**
 * Service role: answers only the quarantined-test-account id lookup
 * (users where is_test = true). Default: no test accounts.
 */
const adminHolder = vi.hoisted(() => ({ testIds: [] as string[] }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => new FakeClient({ users: [adminHolder.testIds.map((id) => ({ id }))] }),
}));

// Locale/analytics/rate-limit ride request scope (cookies, after()) that
// doesn't exist under vitest — stubbed to inert equivalents.
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => {} }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { GET } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';

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
  adminHolder.testIds = [];
});

describe('GET /api/listings — test-account quarantine', () => {
  const TEST_OWNER = '55555555-5555-4555-8555-555555555555';
  const OTHER_TEST = '66666666-6666-4666-8666-666666666666';
  const QUARANTINE_FILTER = `owner_user_id.is.null,owner_user_id.not.in.(${TEST_OWNER},${OTHER_TEST})`;

  it('excludes listings owned by a test account while keeping owner-less ones (directory + map)', async () => {
    adminHolder.testIds = [TEST_OWNER, OTHER_TEST];
    const client = new FakeClient({ business_listings: [[]] });
    authHolder.ctx = contextFor(client);

    const response = await GET(getRequest('?bbox=43,9,45,10'));

    expect(response.status).toBe(200);
    // A bare `not in` would silently drop NULL-owner rows; the null branch
    // keeps imported/unclaimed listings.
    expect(client.queryFor('business_listings').has('or', [QUARANTINE_FILTER])).toBe(true);
  });

  it('composes with the keyset cursor as a separate (ANDed) `or` filter', async () => {
    adminHolder.testIds = [TEST_OWNER, OTHER_TEST];
    const client = new FakeClient({ business_listings: [[]] });
    authHolder.ctx = contextFor(client);

    const cursor = encodeCursor({ createdAt: '2026-07-19T00:00:00Z', id: 'L9' });
    await GET(getRequest(`?cursor=${encodeURIComponent(cursor)}`));

    const ors = client
      .queryFor('business_listings')
      .recorded.filter((entry) => entry.op === 'or')
      .map((entry) => entry.args[0]);
    expect(ors).toHaveLength(2);
    expect(ors).toContain(QUARANTINE_FILTER);
  });

  it('adds no quarantine filter when there are no test accounts', async () => {
    const client = new FakeClient({ business_listings: [[]] });
    authHolder.ctx = contextFor(client);

    await GET(getRequest());

    expect(client.queryFor('business_listings').recorded.some((e) => e.op === 'or')).toBe(false);
  });
});
