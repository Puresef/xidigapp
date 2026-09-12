import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/labs (Discover) — test-account quarantine (users.is_test,
 * migration 20260912050000). A Space led by a quarantined seeded/test account
 * is fixture data: it never appears in Discover (excluded IN the query, before
 * the page limit, so a page stays full and the keyset cursor stays exact), and
 * a test member never counts toward a Space's member count on a Discover
 * card. "My Spaces" (mine=1) is the caller's own list and is unchanged.
 *
 * Recording-fake technique: each query's filter chain is recorded, so the
 * assertions prove which filters ran on which client.
 */

type Row = Record<string, unknown>;

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row[]; error: null; count: number | null }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly rows: Row[]) {}

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
  is(column: string, value: unknown) {
    return this.chain('is', [column, value]);
  }
  not(column: string, op: string, value: unknown) {
    return this.chain('not', [column, op, value]);
  }
  or(filter: string) {
    return this.chain('or', [filter]);
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
      | ((value: {
          data: Row[];
          error: null;
          count: number | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Row[][]> = {}) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.seeds[table]?.shift() ?? []);
    this.calls.push({ table, query });
    return query;
  }

  queryFor(table: string, nth = 0): FakeQuery {
    const hit = this.calls.filter((call) => call.table === table)[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.query;
  }
}

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
// Request-scoped machinery (cookies, Sentry, rate limiting) doesn't exist
// under vitest — stubbed inert.
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => true }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));
vi.mock('@/lib/reputation/service', () => ({ awardBadge: async () => {} }));
vi.mock('@/lib/labs/service', () => ({
  createLab: async () => {
    throw new Error('not under test');
  },
}));

import { GET } from './route';

const LAB: Row = {
  id: 'lab-1',
  slug: 'burao-makers',
  name: 'Burao Makers',
  space_mode: 'club',
  stage: 'active',
  visibility: 'public',
  is_listed: true,
  lead_user_id: 'real-lead',
  short_description: null,
  created_at: '2026-09-01T00:00:00Z',
  last_activity_at: '2026-09-01T00:00:00Z',
};

let userClient: FakeClient;

beforeEach(() => {
  userClient = new FakeClient({ labs: [[LAB]] });
  authHolder.ctx = { supabase: userClient, appUser: { id: 'viewer', status: 'active' } };
});

describe('GET /api/labs — quarantined test accounts', () => {
  it('Discover excludes Spaces led by a test account, in the query', async () => {
    adminHolder.client = new FakeClient({ users: [[{ id: 't1' }, { id: 't2' }]] });

    const res = await GET(new Request('https://app.xidig.net/api/labs'));

    expect(res.status).toBe(200);
    const query = userClient.queryFor('labs');
    expect(query.has('eq', ['is_listed', true])).toBe(true);
    expect(query.has('not', ['lead_user_id', 'in', '(t1,t2)'])).toBe(true);
  });

  it('with no test accounts, Discover adds no lead filter (never an empty `in ()`)', async () => {
    adminHolder.client = new FakeClient({ users: [[], []] });

    await GET(new Request('https://app.xidig.net/api/labs'));

    const nots = userClient
      .queryFor('labs')
      .recorded.filter((entry) => entry.op === 'not' && entry.args[0] === 'lead_user_id');
    expect(nots).toEqual([]);
  });

  it('a test member does not count toward a Discover card’s member count', async () => {
    adminHolder.client = new FakeClient({
      users: [[{ id: 't1' }], [{ id: 't1' }]],
      lab_members: [
        [
          { lab_id: 'lab-1', user_id: 'real-lead', role: 'lead' },
          { lab_id: 'lab-1', user_id: 'real-member', role: 'member' },
          { lab_id: 'lab-1', user_id: 't1', role: 'member' },
        ],
        [],
      ],
    });

    const res = await GET(new Request('https://app.xidig.net/api/labs'));
    const body = (await res.json()) as { data: { items: Array<{ memberCount: number }> } };

    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]?.memberCount).toBe(2);
  });
});
