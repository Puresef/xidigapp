import { describe, expect, it, vi } from 'vitest';

/**
 * PATCH /api/admin/verifications/[id] — unknown-type approve regression.
 * The award effects enumerate verification types and there is NO transaction,
 * so an approve for a type the code does not handle must fail BEFORE the
 * status update: previously a future third enum value (e.g. a new market's
 * operator verification) flowed through, recorded status='approved', a
 * verify_user mod action, a member notification and an audit row — with zero
 * credential effect, silently. Recording-fake technique as elsewhere.
 */

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
  readonly recorded: Array<{ op: string; args: unknown[] }> = [];
  constructor(private readonly row: Row | null) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }

  select(columns: string) {
    return this.chain('select', [columns]);
  }
  update(values: Row) {
    return this.chain('update', [values]);
  }
  insert(values: unknown) {
    return this.chain('insert', [values]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  neq(column: string, value: unknown) {
    return this.chain('neq', [column, value]);
  }
  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    this.recorded.push({ op: 'maybeSingle', args: [] });
    return Promise.resolve({ data: this.row, error: null });
  }
  did(op: string): boolean {
    return this.recorded.some((entry) => entry.op === op);
  }

  then<TResult1, TResult2>(
    onfulfilled?: ((value: { data: Row[] | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
  }
}

class FakeAdmin {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly rowByTable: Record<string, Row | null>) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.rowByTable[table] ?? null);
    this.calls.push({ table, query });
    return query;
  }

  wrote(table: string): boolean {
    return this.calls.some(
      (call) => call.table === table && (call.query.did('update') || call.query.did('insert')),
    );
  }
}

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/auth/guards', () => ({
  requireVerifier: async () => ({ appUser: { id: '99999999-9999-4999-8999-999999999999' } }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/audit', () => ({
  writeAudit: vi.fn(async () => {}),
}));
vi.mock('@/lib/moderation/actions', () => ({
  applyModAction: vi.fn(async () => {}),
}));
vi.mock('@/lib/notifications/notify', () => ({
  insertNotification: vi.fn(async () => {}),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));
// Error responses localize their §27 copy via request-scoped cookies — inert
// under vitest, same stub as the other route tests.
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));

import { writeAudit } from '@/lib/audit';
import { applyModAction } from '@/lib/moderation/actions';
import { insertNotification } from '@/lib/notifications/notify';

import { PATCH } from './route';

const VERIFICATION_ID = '55555555-5555-4555-8555-555555555555';

function patchApprove(): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`https://app.xidig.net/api/admin/verifications/${VERIFICATION_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision: 'approved' }),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id: VERIFICATION_ID }) },
  ];
}

describe('unknown verification type on approve', () => {
  it('500s BEFORE writing anything — no status update, no mod action, no notification, no audit', async () => {
    const admin = new FakeAdmin({
      verifications: {
        id: VERIFICATION_ID,
        user_id: '11111111-1111-4111-8111-111111111111',
        // A future enum value this route does not (yet) handle.
        type: 'regional_operator',
        status: 'scheduled',
        listing_id: null,
      },
    });
    adminHolder.client = admin;

    const response = await PATCH(...patchApprove());

    expect(response.status).toBe(500);
    expect(admin.wrote('verifications')).toBe(false);
    expect(admin.wrote('profiles')).toBe(false);
    expect(admin.wrote('business_listings')).toBe(false);
    expect(admin.wrote('user_badges')).toBe(false);
    expect(vi.mocked(applyModAction)).not.toHaveBeenCalled();
    expect(vi.mocked(insertNotification)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAudit)).not.toHaveBeenCalled();
  });

  it('a known type still approves (guard is not over-broad)', async () => {
    const admin = new FakeAdmin({
      verifications: {
        id: VERIFICATION_ID,
        user_id: '11111111-1111-4111-8111-111111111111',
        type: 'identity',
        status: 'scheduled',
        listing_id: null,
      },
      badge_definitions: { id: '77777777-7777-4777-8777-777777777777' },
    });
    adminHolder.client = admin;

    const response = await PATCH(...patchApprove());

    expect(response.status).toBe(200);
    expect(admin.wrote('verifications')).toBe(true);
    expect(admin.wrote('profiles')).toBe(true);
    expect(vi.mocked(applyModAction)).toHaveBeenCalled();
  });
});
