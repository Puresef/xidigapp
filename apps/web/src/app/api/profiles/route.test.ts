import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/profiles — filter-param canonicalization contract. skills/lanes are
 * stored as canonical lowercase tokens (skill normalize trigger 20260718200000;
 * lane slugs format-locked lowercase) and PostgREST `contains` on text[] is
 * case-sensitive, so the route must fold ?skill= / ?lane= before filtering —
 * the /suuq skill filter is a FREE-TEXT input sent verbatim, so without the
 * fold a member typing "React" silently got zero rows. Same recording-fake
 * technique as api/listings/route.test.ts.
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

  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
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

  from(table: string): FakeQuery {
    const query = new FakeQuery([]);
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

function request(params: string): Request {
  return new Request(`https://app.xidig.net/api/profiles?${params}`);
}

let userClient: FakeClient;

beforeEach(() => {
  userClient = new FakeClient();
  authHolder.ctx = { supabase: userClient };
  adminHolder.client = new FakeClient();
});

describe('GET /api/profiles filter canonicalization', () => {
  it('folds ?skill= to the canonical lowercase token before the contains filter', async () => {
    const response = await GET(request('skill=React'));
    expect(response.status).toBe(200);
    expect(userClient.queryFor('profiles').argsOf('contains')).toEqual(['skills', ['react']]);
  });

  it('folds ?lane= the same way (lane slugs are format-locked lowercase)', async () => {
    const response = await GET(request('lane=Fintech'));
    expect(response.status).toBe(200);
    expect(userClient.queryFor('profiles').argsOf('contains')).toEqual(['lanes', ['fintech']]);
  });

  it('already-canonical tokens pass through unchanged', async () => {
    const response = await GET(request('skill=graphic%20design'));
    expect(response.status).toBe(200);
    expect(userClient.queryFor('profiles').argsOf('contains')).toEqual([
      'skills',
      ['graphic design'],
    ]);
  });
});

describe('GET /api/profiles account-status gate', () => {
  // profiles RLS is `using (true)`, so without this gate a deleted member's
  // tombstone ("Deleted member" + avatar) sat in the people directory while
  // search already hid it. Same rule, same primitive.
  class StatusAdmin extends FakeClient {
    constructor(private readonly statuses: Record<string, string>) {
      super();
    }
    override from(table: string): FakeQuery {
      if (table !== 'users') return super.from(table);
      const rows = Object.entries(this.statuses).map(([id, status]) => ({
        id,
        status,
        is_ai: false,
      }));
      const query = new FakeQuery(rows);
      this.calls.push({ table, query });
      return query;
    }
  }

  it('drops deleted, suspended and deactivated members from the page; keeps a grace-period member', async () => {
    userClient = new FakeClient();
    const seeded = new FakeQuery([
      { user_id: 'a', display_name: 'Live', handle: 'live', created_at: '2026-09-01T00:00:00Z' },
      {
        user_id: 'b',
        display_name: 'Deleted member',
        handle: 'deleted_b',
        created_at: '2026-08-01T00:00:00Z',
      },
      {
        user_id: 'c',
        display_name: 'Paused',
        handle: 'paused',
        created_at: '2026-07-01T00:00:00Z',
      },
      {
        user_id: 'd',
        display_name: 'Leaving',
        handle: 'leaving',
        created_at: '2026-06-01T00:00:00Z',
      },
    ]);
    userClient.from = (table: string) => {
      userClient.calls.push({ table, query: seeded });
      return seeded;
    };
    authHolder.ctx = { supabase: userClient };
    adminHolder.client = new StatusAdmin({
      a: 'active',
      b: 'deleted',
      c: 'suspended',
      d: 'pending_deletion',
    });

    const response = await GET(request('limit=20'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { profiles: Array<{ user_id: string }> } };
    expect(body.data.profiles.map((p) => p.user_id)).toEqual(['a', 'd']);
  });
});
