import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH /api/admin/verifications/[id].
 *
 * 1. Unknown-type approve regression. The award effects enumerate
 *    verification types and there is NO transaction, so an approve for a type
 *    the code does not handle must fail BEFORE the status update.
 * 2. Stale decisions on a deleted member. A request queued before its member
 *    was anonymised used to be approvable: the verification was marked
 *    approved FIRST, then the profile write hit the freeze trigger → 500 with
 *    a half-applied decision; decline/schedule/more-info notified the
 *    tombstone. Now the subject's status is read (service role) before any
 *    write: a deleted subject gets 409 account_deleted, an OPEN request is
 *    closed as 'cancelled' with an audit row naming who/when/why, a final
 *    decision is never overwritten, nothing is awarded, nobody is notified.
 * 3. The race that remains (deleted between that check and the profile
 *    award) fails at the profile write — which now happens BEFORE the
 *    verification is marked approved — and maps to 409, so no half-applied
 *    approval is left behind.
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string };

const order: string[] = [];

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: PgError | null }> {
  readonly recorded: Array<{ op: string; args: unknown[] }> = [];
  constructor(
    private readonly table: string,
    private readonly row: Row | null,
    private readonly writeError: PgError | null,
  ) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    if (op === 'update' || op === 'insert') order.push(`${op}:${this.table}`);
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
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  maybeSingle(): Promise<{ data: Row | null; error: PgError | null }> {
    this.recorded.push({ op: 'maybeSingle', args: [] });
    if (this.did('update')) {
      return Promise.resolve({
        data: this.writeError ? null : { id: 'x' },
        error: this.writeError,
      });
    }
    return Promise.resolve({ data: this.row, error: null });
  }
  did(op: string): boolean {
    return this.recorded.some((entry) => entry.op === op);
  }
  argsOf(op: string) {
    return this.recorded.filter((entry) => entry.op === op).map((entry) => entry.args);
  }

  then<TResult1, TResult2>(
    onfulfilled?:
      | ((value: { data: Row[] | null; error: PgError | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: [], error: this.writeError }).then(onfulfilled, onrejected);
  }
}

class FakeAdmin {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(
    private readonly rowByTable: Record<string, Row | null>,
    private readonly writeErrorByTable: Record<string, PgError> = {},
  ) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(
      table,
      this.rowByTable[table] ?? null,
      this.writeErrorByTable[table] ?? null,
    );
    this.calls.push({ table, query });
    return query;
  }

  wrote(table: string): boolean {
    return this.calls.some(
      (call) => call.table === table && (call.query.did('update') || call.query.did('insert')),
    );
  }

  updatesTo(table: string) {
    return this.calls
      .filter((call) => call.table === table && call.query.did('update'))
      .map((call) => call.query);
  }
}

const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const VERIFIER = '99999999-9999-4999-8999-999999999999';

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
  captureException: vi.fn(),
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
const MEMBER = '11111111-1111-4111-8111-111111111111';
const LISTING = '66666666-6666-4666-8666-666666666666';

function patch(body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`https://app.xidig.net/api/admin/verifications/${VERIFICATION_ID}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id: VERIFICATION_ID }) },
  ];
}

function verification(overrides: Row = {}): Row {
  return {
    id: VERIFICATION_ID,
    user_id: MEMBER,
    type: 'identity',
    status: 'scheduled',
    listing_id: null,
    ...overrides,
  };
}

async function codeOf(response: Response): Promise<string | undefined> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code;
}

beforeEach(() => {
  order.length = 0;
  vi.mocked(writeAudit).mockClear();
  vi.mocked(applyModAction).mockClear();
  vi.mocked(insertNotification).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('unknown verification type on approve', () => {
  it('500s BEFORE writing anything — no status update, no mod action, no notification, no audit', async () => {
    const admin = new FakeAdmin({
      verifications: verification({ type: 'regional_operator' }), // a future enum value
      users: { status: 'active' },
    });
    adminHolder.client = admin;

    const response = await PATCH(...patch({ decision: 'approved' }));

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
      verifications: verification(),
      users: { status: 'active' },
      badge_definitions: { id: '77777777-7777-4777-8777-777777777777' },
    });
    adminHolder.client = admin;

    const response = await PATCH(...patch({ decision: 'approved' }));

    expect(response.status).toBe(200);
    expect(admin.wrote('verifications')).toBe(true);
    expect(admin.wrote('profiles')).toBe(true);
    expect(vi.mocked(applyModAction)).toHaveBeenCalled();
  });
});

describe('a decision on a member who has since been deleted', () => {
  it.each([
    ['approve (identity)', { decision: 'approved' }, verification()],
    [
      'approve (business)',
      { decision: 'approved' },
      verification({ type: 'business', listing_id: LISTING }),
    ],
    ['decline', { decision: 'declined', notes: 'x' }, verification()],
    ['more info', { decision: 'more_info', notes: 'x' }, verification({ status: 'pending' })],
    ['schedule', { bookingUrl: 'https://cal.example.com/zz' }, verification({ status: 'pending' })],
  ])('%s → 409 account_deleted; nothing awarded, nobody notified', async (_label, body, row) => {
    const admin = new FakeAdmin({ verifications: row, users: { status: 'deleted' } });
    adminHolder.client = admin;

    const response = await PATCH(...patch(body));

    expect(response.status).toBe(409);
    expect(await codeOf(response)).toBe('account_deleted');
    expect(admin.wrote('profiles')).toBe(false);
    expect(admin.wrote('business_listings')).toBe(false);
    expect(admin.wrote('user_badges')).toBe(false);
    expect(vi.mocked(applyModAction)).not.toHaveBeenCalled();
    expect(vi.mocked(insertNotification)).not.toHaveBeenCalled();
  });

  it('closes the OPEN request as cancelled — guarded so a final decision can never be overwritten', async () => {
    const admin = new FakeAdmin({ verifications: verification(), users: { status: 'deleted' } });
    adminHolder.client = admin;

    await PATCH(...patch({ decision: 'approved' }));

    const [close] = admin.updatesTo('verifications');
    expect(admin.updatesTo('verifications')).toHaveLength(1);
    expect(close!.argsOf('update')[0]![0]).toMatchObject({ status: 'cancelled' });
    expect(close!.argsOf('update')[0]![0]).not.toHaveProperty('verifier_user_id');
    expect(close!.argsOf('eq')).toContainEqual(['id', VERIFICATION_ID]);
    expect(close!.argsOf('in')).toContainEqual(['status', ['pending', 'scheduled']]);
  });

  it('audits the closure: who, when (the row), why and what was attempted', async () => {
    const admin = new FakeAdmin({ verifications: verification(), users: { status: 'deleted' } });
    adminHolder.client = admin;

    await PATCH(...patch({ decision: 'declined' }));

    expect(vi.mocked(writeAudit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeAudit).mock.calls[0]![1]).toEqual({
      actorUserId: VERIFIER,
      action: 'verification.closed_subject_deleted',
      targetType: 'verification',
      targetId: VERIFICATION_ID,
      metadata: { reason: 'subject_deleted', priorStatus: 'scheduled', attempted: 'declined' },
    });
  });

  it('an already-final request is left exactly as it is (no write, no closure audit)', async () => {
    const admin = new FakeAdmin({
      verifications: verification({ status: 'approved' }),
      users: { status: 'deleted' },
    });
    adminHolder.client = admin;

    const response = await PATCH(...patch({ decision: 'declined' }));

    expect(response.status).toBe(409);
    expect(admin.wrote('verifications')).toBe(false);
    expect(vi.mocked(writeAudit)).not.toHaveBeenCalled();
  });

  it('a malformed request is rejected before the subject is even considered — nothing is closed', async () => {
    const admin = new FakeAdmin({ verifications: verification(), users: { status: 'deleted' } });
    adminHolder.client = admin;

    const response = await PATCH(...patch({ decision: 'maybe' }));

    expect(response.status).toBe(400);
    expect(admin.wrote('verifications')).toBe(false);
  });

  it('a subject in the deletion grace is still a member: the approval proceeds', async () => {
    const admin = new FakeAdmin({
      verifications: verification(),
      users: { status: 'pending_deletion' },
      badge_definitions: { id: '77777777-7777-4777-8777-777777777777' },
    });
    adminHolder.client = admin;

    const response = await PATCH(...patch({ decision: 'approved' }));

    expect(response.status).toBe(200);
    expect(admin.wrote('profiles')).toBe(true);
  });
});

describe('the deletion race during an identity approval', () => {
  it('awards the profile BEFORE marking the request approved', async () => {
    const admin = new FakeAdmin({
      verifications: verification(),
      users: { status: 'active' },
      badge_definitions: { id: '77777777-7777-4777-8777-777777777777' },
    });
    adminHolder.client = admin;

    await PATCH(...patch({ decision: 'approved' }));

    expect(order.indexOf('update:profiles')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('update:profiles')).toBeLessThan(order.indexOf('update:verifications'));
  });

  it('a freeze-trigger refusal maps to 409 and leaves the request NOT approved', async () => {
    const admin = new FakeAdmin(
      { verifications: verification(), users: { status: 'active' } },
      {
        profiles: {
          code: 'P0001',
          message: `profile_frozen: account ${MEMBER} is anonymised; its profile cannot be updated`,
        },
      },
    );
    adminHolder.client = admin;

    const response = await PATCH(...patch({ decision: 'approved' }));

    expect(response.status).toBe(409);
    expect(await codeOf(response)).toBe('account_deleted');
    expect(admin.wrote('verifications')).toBe(false);
    expect(vi.mocked(applyModAction)).not.toHaveBeenCalled();
    expect(vi.mocked(insertNotification)).not.toHaveBeenCalled();
  });
});
