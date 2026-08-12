import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * POST/DELETE /api/mentor/slots/[id]/book — Task 9 bookable mentor slots.
 *
 * The claim is a single conditional UPDATE
 * (`booked_by_user_id is null AND starts_at > now()`), never a
 * read-then-write: two members racing the same slot can never both win, and
 * a slot already in the past can never be claimed. Zero rows updated means
 * someone else already has it (or it wasn't open/future) → 409
 * mentor_slot_taken. The partial unique index on (residency_id,
 * booked_by_user_id) catches the OTHER race — this member already holding a
 * different slot in the same residency — as a 23505, mapped to 409
 * mentor_already_booked rather than a raw DB error.
 *
 * All writes are service-role (`mentor_slots` revokes member write grants
 * entirely — migration 20260812000000), so the admin client is legitimately
 * central here, unlike e.g. endorsements. Same FakeQuery/FakeClient
 * recording-fake idiom as endorsements/route.test.ts and labs/route.test.ts
 * (authHolder.error for the 401 path).
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string } | null;

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row | null; error: PgError }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly seed: { row?: Row | null; error?: PgError }) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }
  update(values: Row) {
    return this.chain('update', [values]);
  }
  insert(values: Row) {
    return this.chain('insert', [values]);
  }
  select(columns?: string) {
    return this.chain('select', columns === undefined ? [] : [columns]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  is(column: string, value: unknown) {
    return this.chain('is', [column, value]);
  }
  gt(column: string, value: unknown) {
    return this.chain('gt', [column, value]);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }
  allArgsOf(op: string): unknown[][] {
    return this.recorded.filter((entry) => entry.op === op).map((entry) => entry.args);
  }

  then<T1, T2>(
    onfulfilled?: ((value: { data: Row | null; error: PgError }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({
      data: this.seed.row ?? null,
      error: this.seed.error ?? null,
    }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(
    private readonly seeds: Record<string, Array<{ row?: Row | null; error?: PgError }>> = {},
  ) {}

  from(table: string): FakeQuery {
    const query = new FakeQuery(this.seeds[table]?.shift() ?? {});
    this.calls.push({ table, query });
    return query;
  }
  queryFor(table: string, nth = 0): FakeQuery {
    const hit = this.calls.filter((call) => call.table === table)[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.query;
  }
  queryCount(table: string): number {
    return this.calls.filter((call) => call.table === table).length;
  }
}

const authHolder = vi.hoisted(() => ({ ctx: null as unknown, error: null as Error | null }));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { DELETE, POST } from './route';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER_MEMBER = '22222222-2222-4222-8222-222222222222';
const ADVISOR = '33333333-3333-4333-8333-333333333333';
const SLOT_ID = '44444444-4444-4444-8444-444444444444';
const RESIDENCY_ID = '55555555-5555-4555-8555-555555555555';

function bookRequest(): Request {
  return new Request(`https://xidig.test/api/mentor/slots/${SLOT_ID}/book`, { method: 'POST' });
}
function unbookRequest(): Request {
  return new Request(`https://xidig.test/api/mentor/slots/${SLOT_ID}/book`, { method: 'DELETE' });
}
function routeCtx() {
  return { params: Promise.resolve({ id: SLOT_ID }) };
}

function contextFor(client: FakeClient, userId: string): unknown {
  return {
    user: { id: userId },
    appUser: { id: userId, role: 'member', status: 'active' },
    supabase: client,
  };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
});

describe('POST /api/mentor/slots/[id]/book', () => {
  it('claims an open, future slot atomically and notifies the advisor', async () => {
    const client = new FakeClient({
      mentor_slots: [
        { row: { id: SLOT_ID, residency_id: RESIDENCY_ID, starts_at: '2099-01-01T18:00:00Z' } },
      ],
      mentor_residencies: [{ row: { advisor_user_id: ADVISOR } }],
      notifications: [{}],
    });
    authHolder.ctx = contextFor(client, MEMBER);
    adminHolder.client = client;

    const response = await POST(bookRequest(), routeCtx());
    const body = (await response.json()) as { data: { id: string } };

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(SLOT_ID);

    // The claim is a single conditional UPDATE — never a read then a write.
    const claim = client.queryFor('mentor_slots');
    expect(claim.argsOf('update')).toEqual([
      { booked_by_user_id: MEMBER, booked_at: expect.any(String) },
    ]);
    expect(claim.argsOf('eq')).toEqual(['id', SLOT_ID]);
    expect(claim.argsOf('is')).toEqual(['booked_by_user_id', null]);
    expect(claim.argsOf('gt')?.[0]).toBe('starts_at');

    // The advisor is notified (actor = the booking member), not the reverse.
    expect(client.queryFor('notifications').argsOf('insert')).toEqual([
      expect.objectContaining({ user_id: ADVISOR, actor_user_id: MEMBER, type: 'mentor_slot_booked' }),
    ]);
  });

  it('409s mentor_slot_taken when the update claims zero rows (already booked, or no longer open)', async () => {
    const client = new FakeClient({
      mentor_slots: [{ row: null }],
    });
    authHolder.ctx = contextFor(client, MEMBER);
    adminHolder.client = client;

    const response = await POST(bookRequest(), routeCtx());

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('mentor_slot_taken');
    // No notification is written on a failed claim.
    expect(client.queryCount('notifications')).toBe(0);
  });

  it('409s mentor_already_booked when the member already holds a slot in this residency (23505)', async () => {
    const client = new FakeClient({
      mentor_slots: [{ error: { code: '23505', message: 'mentor_slots_one_booking_per_member' } }],
    });
    authHolder.ctx = contextFor(client, MEMBER);
    adminHolder.client = client;

    const response = await POST(bookRequest(), routeCtx());

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('mentor_already_booked');
  });

  it('401s an unauthenticated caller before touching the database', async () => {
    authHolder.error = new ApiError('session_expired', 401);
    const client = new FakeClient();
    adminHolder.client = client;

    const response = await POST(bookRequest(), routeCtx());

    expect(response.status).toBe(401);
    expect(client.calls).toEqual([]);
  });
});

describe('DELETE /api/mentor/slots/[id]/book', () => {
  it('releases only the caller’s own booking', async () => {
    const client = new FakeClient({ mentor_slots: [{ row: { id: SLOT_ID } }] });
    authHolder.ctx = contextFor(client, MEMBER);
    adminHolder.client = client;

    const response = await DELETE(unbookRequest(), routeCtx());

    expect(response.status).toBe(200);
    const release = client.queryFor('mentor_slots');
    expect(release.argsOf('update')).toEqual([{ booked_by_user_id: null, booked_at: null }]);
    expect(release.allArgsOf('eq')).toEqual(
      expect.arrayContaining([['booked_by_user_id', MEMBER]]),
    );
  });

  it('never lets one member release another member’s booking', async () => {
    // OTHER_MEMBER never appears in the update filter — the WHERE always
    // pins booked_by_user_id to the CALLER, so there is no path for MEMBER's
    // request to touch a row booked by someone else.
    const client = new FakeClient({ mentor_slots: [{ row: null }] });
    authHolder.ctx = contextFor(client, OTHER_MEMBER);
    adminHolder.client = client;

    const response = await DELETE(unbookRequest(), routeCtx());

    expect(response.status).toBe(200);
    expect(client.queryFor('mentor_slots').allArgsOf('eq')).toEqual(
      expect.arrayContaining([['booked_by_user_id', OTHER_MEMBER]]),
    );
  });
});
