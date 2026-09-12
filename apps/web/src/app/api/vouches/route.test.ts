import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/vouches — the target must be a live account.
 *
 * The auto-upgrade at the vouch threshold writes profiles.verification_status
 * on the vouchee. For an anonymised member that would re-verify a tombstone
 * (and the profile freeze trigger now refuses it with an error). The route
 * refuses up front with the same 404 an unknown id gets, before any vouch row
 * is inserted, so the tombstone stays a tombstone and no vouch is recorded
 * against an account that no longer exists as a member.
 */

type Row = Record<string, unknown>;
interface Seed {
  row?: Row | null;
  /** List results (e.g. the quarantined test-account ids). */
  rows?: Row[];
  count?: number;
  /** A count that depends on the recorded filters — emulates PostgREST `not in`. */
  countFor?: (query: FakeQuery) => number;
  error?: { code: string; message: string };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count: number | null }> {
  readonly ops: string[] = [];
  readonly calls: Array<{ op: string; args: unknown[] }> = [];
  constructor(private readonly seed: Seed) {}
  private chain(op: string, args: unknown[] = []): this {
    this.ops.push(op);
    this.calls.push({ op, args });
    return this;
  }
  select(...args: unknown[]) {
    return this.chain('select', args);
  }
  insert(...args: unknown[]) {
    return this.chain('insert', args);
  }
  update(...args: unknown[]) {
    return this.chain('update', args);
  }
  eq(...args: unknown[]) {
    return this.chain('eq', args);
  }
  in(...args: unknown[]) {
    return this.chain('in', args);
  }
  not(...args: unknown[]) {
    return this.chain('not', args);
  }
  maybeSingle() {
    return this.chain('maybeSingle');
  }
  argsOf(op: string): unknown[] | undefined {
    return this.calls.find((call) => call.op === op)?.args;
  }
  then<T1, T2>(
    onfulfilled?:
      ((v: { data: unknown; error: unknown; count: number | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({
      data: this.seed.rows ?? this.seed.row ?? null,
      error: this.seed.error ?? null,
      count: this.seed.countFor ? this.seed.countFor(this) : (this.seed.count ?? null),
    }).then(onfulfilled, onrejected);
  }
}

class FakeAdmin {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Seed[]>) {}
  from(table: string) {
    const q = new FakeQuery(this.seeds[table]?.shift() ?? {});
    this.calls.push({ table, query: q });
    return q;
  }
  wrote(table: string) {
    return this.calls.some((c) => c.table === table && c.query.ops.includes('insert'));
  }
  updated(table: string) {
    return this.calls.some((c) => c.table === table && c.query.ops.includes('update'));
  }
  queryFor(table: string, nth = 0): FakeQuery {
    const hit = this.calls.filter((c) => c.table === table)[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.query;
  }
}

/**
 * The route reads `users` twice: first the quarantined test-account set
 * (`loadTestAccountIds`), then the vouchee's status.
 */
function usersSeeds(target: Row | null, testIds: string[] = []): Seed[] {
  return [{ rows: testIds.map((id) => ({ id })) }, { row: target }];
}

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({
    user: { id: 'voucher' },
    appUser: { id: 'voucher', status: 'active' },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => adminHolder.client }));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));
vi.mock('@/lib/notifications/notify', () => ({ insertNotification: async () => {} }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { POST } from './route';

const TARGET = '11111111-1111-4111-8111-111111111111';

function post() {
  return new Request('https://app.xidig.net/api/vouches', {
    method: 'POST',
    body: JSON.stringify({ voucheeUserId: TARGET }),
    headers: { 'content-type': 'application/json' },
  });
}

let admin: FakeAdmin;
beforeEach(() => {
  admin = new FakeAdmin({});
});

describe('POST /api/vouches target account state', () => {
  it.each(['deleted', 'suspended', 'deactivated'])(
    'refuses a %s target with 404 before inserting anything',
    async (status) => {
      admin = new FakeAdmin({
        profiles: [{ row: { verification_status: 'identity_verified' } }],
        users: usersSeeds({ status }),
      });
      adminHolder.client = admin;
      const res = await POST(post());
      expect(res.status).toBe(404);
      expect(admin.wrote('vouches')).toBe(false);
    },
  );

  it('refuses an unknown target the same way', async () => {
    admin = new FakeAdmin({
      profiles: [{ row: { verification_status: 'identity_verified' } }],
      users: usersSeeds(null),
    });
    adminHolder.client = admin;
    expect((await POST(post())).status).toBe(404);
    expect(admin.wrote('vouches')).toBe(false);
  });

  it('records a vouch for a target in the deletion grace (still a member)', async () => {
    admin = new FakeAdmin({
      profiles: [
        { row: { verification_status: 'identity_verified' } },
        { row: { verification_status: 'unverified' } },
      ],
      users: usersSeeds({ status: 'pending_deletion' }),
      vouches: [{ row: null }, { row: null, count: 1 }],
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(admin.wrote('vouches')).toBe(true);
  });

  it('records a vouch for a live target', async () => {
    admin = new FakeAdmin({
      profiles: [
        { row: { verification_status: 'identity_verified' } },
        { row: { verification_status: 'unverified' } },
      ],
      users: usersSeeds({ status: 'active' }),
      vouches: [{ row: null }, { row: null, count: 1 }],
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(admin.wrote('vouches')).toBe(true);
  });

  it('a vouchee anonymised mid-request (freeze trigger at the upgrade) → 409 account_deleted, not a 500', async () => {
    admin = new FakeAdmin({
      profiles: [
        { row: { verification_status: 'identity_verified' } },
        { row: { verification_status: 'unverified' } },
        {
          error: {
            code: 'P0001',
            message: `profile_frozen: account ${TARGET} is anonymised; its profile cannot be updated`,
          },
        },
      ],
      users: usersSeeds({ status: 'active' }),
      vouches: [{ row: null }, { row: null, count: 3 }],
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('account_deleted');
    expect(admin.wrote('user_badges')).toBe(false);
  });
});

/**
 * Test-account quarantine (users.is_test). A seeded/test account is not a real
 * member: it cannot vouch, it cannot be vouched for, and a test vouch already
 * on file never counts toward Community Verified.
 */
describe('POST /api/vouches test-account quarantine', () => {
  const TEST_A = '99999999-9999-4999-8999-99999999999a';
  const TEST_B = '99999999-9999-4999-8999-99999999999b';

  async function errorCode(res: Response): Promise<string> {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  it('a test account cannot vouch — 403 forbidden (same as an unverified voucher), nothing written', async () => {
    admin = new FakeAdmin({
      // Even a test persona the seeder marked identity-verified.
      profiles: [{ row: { verification_status: 'identity_verified' } }],
      users: usersSeeds({ status: 'active' }, ['voucher']),
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('forbidden');
    expect(admin.wrote('vouches')).toBe(false);
    expect(admin.updated('profiles')).toBe(false);
  });

  it('a test account cannot be vouched for — 404 like a non-live target, nothing written', async () => {
    admin = new FakeAdmin({
      profiles: [{ row: { verification_status: 'identity_verified' } }],
      users: usersSeeds({ status: 'active' }, [TARGET]),
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect(admin.wrote('vouches')).toBe(false);
  });

  it('the threshold ignores test vouchers: 2 test + 2 real on file → tally 2, no upgrade', async () => {
    admin = new FakeAdmin({
      profiles: [{ row: { verification_status: 'identity_verified' } }],
      users: usersSeeds({ status: 'active' }, [TEST_A, TEST_B]),
      vouches: [
        { row: null },
        {
          // Four rows on file for the vouchee; two are from test accounts.
          // The count only drops them when the query asks PostgREST to.
          countFor: (query) => {
            const not = query.argsOf('not');
            return not && not[0] === 'voucher_user_id' && not[1] === 'in' ? 2 : 4;
          },
        },
      ],
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { vouchCount: number } }).data.vouchCount).toBe(2);
    // The count query carries the exclusion literally.
    expect(admin.queryFor('vouches', 1).argsOf('not')).toEqual([
      'voucher_user_id',
      'in',
      `(${TEST_A},${TEST_B})`,
    ]);
    // Below the threshold once test vouches are out: no upgrade, no badge.
    expect(admin.updated('profiles')).toBe(false);
    expect(admin.wrote('user_badges')).toBe(false);
  });

  it('real vouchers reaching the threshold still upgrade the vouchee', async () => {
    admin = new FakeAdmin({
      profiles: [
        { row: { verification_status: 'identity_verified' } },
        { row: { verification_status: 'unverified' } },
        { row: null },
      ],
      users: usersSeeds({ status: 'active' }, [TEST_A]),
      vouches: [{ row: null }, { countFor: (query) => (query.argsOf('not') ? 3 : 5) }],
      badge_definitions: [{ row: { id: 'badge-community' } }],
      user_badges: [{ row: null }],
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { vouchCount: number } }).data.vouchCount).toBe(3);
    expect(admin.updated('profiles')).toBe(true);
    expect(admin.wrote('user_badges')).toBe(true);
  });

  it('with no test accounts at all, the count is unfiltered (no empty `in ()` list)', async () => {
    admin = new FakeAdmin({
      profiles: [
        { row: { verification_status: 'identity_verified' } },
        { row: { verification_status: 'unverified' } },
      ],
      users: usersSeeds({ status: 'active' }),
      vouches: [{ row: null }, { count: 1 }],
    });
    adminHolder.client = admin;
    expect((await POST(post())).status).toBe(200);
    expect(admin.queryFor('vouches', 1).argsOf('not')).toBeUndefined();
  });
});
