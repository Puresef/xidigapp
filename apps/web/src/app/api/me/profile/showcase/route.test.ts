import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PUT /api/me/profile/showcase — Bandhig, acceptance A5.
 *
 * "Pinned refs only, nothing engagement-sourced" is enforced here rather than
 * in the grid: the only way a tile exists is a member naming an entity that
 * their OWN RLS-scoped read can see. These tests pin that down — an id the
 * caller cannot read never reaches the RPC, and the stored order is the array
 * order, not a ranking.
 */

type Row = Record<string, unknown>;

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row | null; error: null }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly row: Row | null) {}

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
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  then<T1, T2>(
    onfulfilled?: ((value: { data: Row | null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.row, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeCaller {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Array<Row | null>> = {}) {}

  from(table: string): FakeQuery {
    const seeded = this.seeds[table];
    const row = seeded && seeded.length > 0 ? seeded.shift()! : null;
    const query = new FakeQuery(row);
    this.calls.push({ table, query });
    return query;
  }
  tablesTouched(): string[] {
    return this.calls.map((call) => call.table);
  }
}

class FakeAdmin {
  readonly rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  async rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    return { data: null, error: null };
  }
  from(): never {
    throw new Error('the showcase route must not read tables through the service role');
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
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { PUT } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const POST_A = '33333333-3333-4333-8333-333333333333';
const POST_B = '44444444-4444-4444-8444-444444444444';
const LAB_A = '55555555-5555-4555-8555-555555555555';

function putRequest(items: unknown): Request {
  return new Request('https://xidig.test/api/me/profile/showcase', {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}

function contextFor(client: FakeCaller): unknown {
  return {
    user: { id: USER_ID },
    appUser: { id: USER_ID, role: 'member', status: 'active' },
    supabase: client,
  };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeEach(() => {
  authHolder.ctx = null;
  adminHolder.client = null;
});

describe('PUT /api/me/profile/showcase', () => {
  it('stores array order as position 1..n and checks each target under the caller’s RLS', async () => {
    const caller = new FakeCaller({
      posts: [{ id: POST_A }, { id: POST_B }],
      labs: [{ id: LAB_A }],
    });
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await PUT(
      putRequest([
        { entityType: 'post', entityId: POST_A },
        { entityType: 'lab', entityId: LAB_A },
        { entityType: 'post', entityId: POST_B },
      ]),
    );

    expect(response.status).toBe(200);
    expect(admin.rpcCalls[0]?.fn).toBe('set_profile_showcase');
    expect(admin.rpcCalls[0]?.args['p_items']).toEqual([
      { position: 1, entity_type: 'post', entity_id: POST_A, media_id: null },
      { position: 2, entity_type: 'lab', entity_id: LAB_A, media_id: null },
      { position: 3, entity_type: 'post', entity_id: POST_B, media_id: null },
    ]);
    expect(caller.tablesTouched()).toEqual(['posts', 'labs', 'posts']);
  });

  it('refuses a target the caller cannot read, and never reaches the RPC (A5)', async () => {
    // posts returns null: the id either doesn't exist or RLS hides it. The
    // route must not distinguish the two.
    const caller = new FakeCaller({ posts: [null] });
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await PUT(putRequest([{ entityType: 'post', entityId: POST_A }]));

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('pin_target_invalid');
    expect(admin.rpcCalls).toEqual([]);
  });

  it('refuses the same entity twice — the unique constraint stated in §27 words', async () => {
    const caller = new FakeCaller({ posts: [{ id: POST_A }, { id: POST_A }] });
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await PUT(
      putRequest([
        { entityType: 'post', entityId: POST_A },
        { entityType: 'post', entityId: POST_A },
      ]),
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('pin_target_invalid');
    expect(admin.rpcCalls).toEqual([]);
  });

  it('caps the grid at five tiles — the sixth cell is the add tile, not a record', async () => {
    authHolder.ctx = contextFor(new FakeCaller());
    adminHolder.client = new FakeAdmin();

    // Six is one past the cap. That five itself is *accepted* is locked at the
    // constraint level in packages/db/src/aniga-v3.test.ts, where distinct
    // entity ids are cheap — here every item reuses POST_A, so a five-item case
    // would trip the duplicate-entity rule instead and prove nothing about the cap.
    const response = await PUT(
      putRequest(Array.from({ length: 6 }, () => ({ entityType: 'post', entityId: POST_A }))),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('accepts an empty set — clearing the grid is a save, not a delete', async () => {
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(new FakeCaller());
    adminHolder.client = admin;

    const response = await PUT(putRequest([]));

    expect(response.status).toBe(200);
    expect(admin.rpcCalls[0]?.args['p_items']).toEqual([]);
  });
});
