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
  count?: number;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null; count: number | null }> {
  readonly ops: string[] = [];
  constructor(private readonly seed: Seed) {}
  private chain(op: string): this {
    this.ops.push(op);
    return this;
  }
  select() {
    return this.chain('select');
  }
  insert() {
    return this.chain('insert');
  }
  update() {
    return this.chain('update');
  }
  eq() {
    return this.chain('eq');
  }
  in() {
    return this.chain('in');
  }
  maybeSingle() {
    return this.chain('maybeSingle');
  }
  then<T1, T2>(
    onfulfilled?:
      ((v: { data: unknown; error: null; count: number | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({
      data: this.seed.row ?? null,
      error: null,
      count: this.seed.count ?? null,
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
  it.each(['deleted', 'suspended', 'deactivated', 'pending_deletion'])(
    'refuses a %s target with 404 before inserting anything',
    async (status) => {
      admin = new FakeAdmin({
        profiles: [{ row: { verification_status: 'identity_verified' } }],
        users: [{ row: { status } }],
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
      users: [{ row: null }],
    });
    adminHolder.client = admin;
    expect((await POST(post())).status).toBe(404);
    expect(admin.wrote('vouches')).toBe(false);
  });

  it('records a vouch for a live target', async () => {
    admin = new FakeAdmin({
      profiles: [
        { row: { verification_status: 'identity_verified' } },
        { row: { verification_status: 'unverified' } },
      ],
      users: [{ row: { status: 'active' } }],
      vouches: [{ row: null }, { row: null, count: 1 }],
    });
    adminHolder.client = admin;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(admin.wrote('vouches')).toBe(true);
  });
});
