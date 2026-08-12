import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/events/[slug]/checkin — Task 4 (Munaasabado): the host's door
 * list. Three properties this route owes the mechanics upgrade:
 *
 *   * authz mirrors requireManageableEvent (host or mod/admin) — a plain
 *     member can never mark anyone's attendance;
 *   * the door opens at starts_at — before that it's a 409
 *     event_checkin_not_open, never a silent write;
 *   * the write targets an EXISTING RSVP row only, and sets/clears
 *     checked_in_at via the admin client (event_rsvps has no member update
 *     policy for other people's rows — the gate lives here).
 *
 * FakeQuery/FakeClient harness from app/api/endorsements/route.test.ts,
 * adapted: here the ADMIN client is legitimately used for the write, so
 * getSupabaseAdmin returns a FakeClient instead of throwing.
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string } | null;

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row | null; error: PgError; count: number | null }> {
  readonly recorded: Recorded[] = [];
  constructor(
    private readonly seed: { row?: Row | null; error?: PgError; count?: number | null },
  ) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }
  select(columns: string, options?: unknown) {
    return this.chain('select', options === undefined ? [columns] : [columns, options]);
  }
  update(values: Row) {
    return this.chain('update', [values]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }

  then<T1, T2>(
    onfulfilled?:
      | ((value: {
          data: Row | null;
          error: PgError;
          count: number | null;
        }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({
      data: this.seed.row ?? null,
      error: this.seed.error ?? null,
      count: this.seed.count ?? null,
    }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(
    private readonly seeds: Record<
      string,
      Array<{ row?: Row | null; error?: PgError; count?: number | null }>
    > = {},
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

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const viewHolder = vi.hoisted(() => ({ view: null as unknown }));
const emitted = vi.hoisted(() => ({ events: [] as Array<{ name: string }> }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/events/views', () => ({
  getMemberEventView: async () => viewHolder.view,
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: (e: { name: string }) => {
    emitted.events.push(e);
  },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { POST } from './route';

const HOST = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

const STARTED = '2026-08-10T09:00:00Z'; // in the past relative to the real clock
const NOT_YET = '2126-01-01T09:00:00Z'; // far future — the door is not open

function contextFor(userId: string, role = 'member'): unknown {
  return {
    user: { id: userId },
    appUser: { id: userId, role, status: 'active' },
    supabase: new FakeClient(),
  };
}

function viewFor(overrides: { isHost?: boolean; startsAt?: string } = {}): unknown {
  return {
    event: {
      id: EVENT_ID,
      slug: 'tea-talk',
      starts_at: overrides.startsAt ?? STARTED,
      ends_at: null,
      status: 'published',
    },
    viewer: { isHost: overrides.isHost ?? true, rsvp: null },
  };
}

function postRequest(body: unknown): Request {
  return new Request('https://xidig.test/api/events/tea-talk/checkin', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function routeParams(slug = 'tea-talk'): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeEach(() => {
  authHolder.ctx = null;
  adminHolder.client = new FakeClient();
  viewHolder.view = null;
  emitted.events.length = 0;
});

describe('POST /api/events/[slug]/checkin', () => {
  it('403s a plain member who is not the host, before any admin write', async () => {
    authHolder.ctx = contextFor(TARGET, 'member');
    viewHolder.view = viewFor({ isHost: false });
    const admin = new FakeClient();
    adminHolder.client = admin;

    const response = await POST(postRequest({ userId: TARGET, checkedIn: true }), routeParams());

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('forbidden');
    expect(admin.calls).toEqual([]);
  });

  it('409s event_checkin_not_open before starts_at', async () => {
    authHolder.ctx = contextFor(HOST, 'member');
    viewHolder.view = viewFor({ isHost: true, startsAt: NOT_YET });
    const admin = new FakeClient();
    adminHolder.client = admin;

    const response = await POST(postRequest({ userId: TARGET, checkedIn: true }), routeParams());

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('event_checkin_not_open');
    expect(admin.calls).toEqual([]);
  });

  it('404s when the target has no RSVP row — check-in never invents attendance', async () => {
    authHolder.ctx = contextFor(HOST, 'member');
    viewHolder.view = viewFor({ isHost: true });
    const admin = new FakeClient({ event_rsvps: [{ row: null }] });
    adminHolder.client = admin;

    const response = await POST(postRequest({ userId: TARGET, checkedIn: true }), routeParams());

    expect(response.status).toBe(404);
    expect(admin.queryCount('event_rsvps')).toBe(1); // lookup only, no update
  });

  it('happy path: the host sets checked_in_at on the target RSVP and emits event_checked_in', async () => {
    authHolder.ctx = contextFor(HOST, 'member');
    viewHolder.view = viewFor({ isHost: true });
    const admin = new FakeClient({
      event_rsvps: [{ row: { user_id: TARGET } }, {}],
    });
    adminHolder.client = admin;

    const response = await POST(postRequest({ userId: TARGET, checkedIn: true }), routeParams());
    const body = (await response.json()) as { data: { checkedIn: boolean } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ checkedIn: true });

    const update = admin.queryFor('event_rsvps', 1);
    const [values] = update.argsOf('update') as [Row];
    expect(typeof values.checked_in_at).toBe('string');
    expect(update.recorded.filter((r) => r.op === 'eq').map((r) => r.args)).toEqual([
      ['event_id', EVENT_ID],
      ['user_id', TARGET],
    ]);
    expect(emitted.events.map((e) => e.name)).toEqual(['event_checked_in']);
  });

  it('checkedIn:false clears checked_in_at (undo stays possible at the door)', async () => {
    authHolder.ctx = contextFor(HOST, 'member');
    viewHolder.view = viewFor({ isHost: true });
    const admin = new FakeClient({
      event_rsvps: [{ row: { user_id: TARGET } }, {}],
    });
    adminHolder.client = admin;

    const response = await POST(postRequest({ userId: TARGET, checkedIn: false }), routeParams());
    const body = (await response.json()) as { data: { checkedIn: boolean } };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ checkedIn: false });
    expect(admin.queryFor('event_rsvps', 1).argsOf('update')).toEqual([{ checked_in_at: null }]);
  });

  it('a mod who is not the host may run the door (requireManageableEvent mirror)', async () => {
    authHolder.ctx = contextFor(TARGET, 'mod');
    viewHolder.view = viewFor({ isHost: false });
    adminHolder.client = new FakeClient({
      event_rsvps: [{ row: { user_id: TARGET } }, {}],
    });

    const response = await POST(postRequest({ userId: TARGET, checkedIn: true }), routeParams());

    expect(response.status).toBe(200);
  });

  it('400s a malformed body (non-uuid userId)', async () => {
    authHolder.ctx = contextFor(HOST, 'member');
    viewHolder.view = viewFor({ isHost: true });

    const response = await POST(postRequest({ userId: 'not-a-uuid', checkedIn: true }), routeParams());

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_request');
  });
});
