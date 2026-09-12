import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/profiles (the /suuq People directory) — test-account quarantine
 * (users.is_test, migration 20260912050000). A quarantined seeded/test
 * account is never listed: it is excluded IN the directory query (before the
 * page limit, so a page still fills and the keyset cursor stays exact), with
 * the same `not in` shape as the directory opt-outs.
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
  not(column: string, op: string, value: unknown) {
    return this.chain('not', [column, op, value]);
  }
  contains(column: string, values: unknown) {
    return this.chain('contains', [column, values]);
  }
  ilike(column: string, pattern: string) {
    return this.chain('ilike', [column, pattern]);
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
      ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Row[]> = {}) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.seeds[table] ?? []);
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
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));

import { GET } from './route';

let userClient: FakeClient;

beforeEach(() => {
  userClient = new FakeClient();
  authHolder.ctx = { supabase: userClient };
});

describe('GET /api/profiles — quarantined test accounts are never listed', () => {
  it('excludes test accounts in the directory query, alongside the opt-outs', async () => {
    const admin = new FakeClient({
      user_settings: [{ user_id: 'opted-out' }],
      users: [{ id: 't1' }, { id: 't2' }],
    });
    adminHolder.client = admin;

    const res = await GET(new Request('https://app.xidig.net/api/profiles'));

    expect(res.status).toBe(200);
    const query = userClient.queryFor('profiles');
    expect(query.has('not', ['user_id', 'in', '(opted-out)'])).toBe(true);
    expect(query.has('not', ['user_id', 'in', '(t1,t2)'])).toBe(true);
    expect(admin.queryFor('users').has('eq', ['is_test', true])).toBe(true);
  });

  it('with no test accounts, no extra filter is added (never an empty `in ()`)', async () => {
    adminHolder.client = new FakeClient({ user_settings: [], users: [] });

    const res = await GET(new Request('https://app.xidig.net/api/profiles'));

    expect(res.status).toBe(200);
    const nots = userClient
      .queryFor('profiles')
      .recorded.filter((entry) => entry.op === 'not' && entry.args[0] === 'user_id');
    expect(nots).toEqual([]);
  });
});
