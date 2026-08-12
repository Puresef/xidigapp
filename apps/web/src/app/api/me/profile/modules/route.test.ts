import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PUT /api/me/profile/modules — ruling 7 enforcement.
 *
 * The acceptance criterion (A3) is that the owner's toggle on a flag-gated
 * module is REJECTED, not hidden, and that the rejection is real rather than
 * cosmetic. So these tests assert two separate things: that the pre-check
 * refuses before any write reaches the database, and that the trigger's 42501
 * lands on the same 409 when the pre-check is bypassed (a flag flipping off
 * mid-request, or a future caller skipping it).
 *
 * Same recording-fake technique as api/listings/route.test.ts: the fakes record
 * every call, so "no write happened" is an assertion, not an assumption.
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string } | null;

/** select().eq() chain that resolves to a fixed row set. */
class FakeSelect implements PromiseLike<{ data: Row[]; error: null }> {
  readonly recorded: Array<{ op: string; args: unknown[] }> = [];
  constructor(private readonly rows: Row[]) {}

  select(columns: string) {
    this.recorded.push({ op: 'select', args: [columns] });
    return this;
  }
  eq(column: string, value: unknown) {
    this.recorded.push({ op: 'eq', args: [column, value] });
    return this;
  }
  then<T1, T2>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeCaller {
  readonly rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  readonly tables: string[] = [];
  constructor(
    private readonly flags: Record<string, boolean>,
    private readonly rows: Row[] = [],
  ) {}

  async rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    return { data: this.flags[String(args['p_key'])] === true, error: null };
  }
  from(table: string) {
    this.tables.push(table);
    return new FakeSelect(this.rows);
  }
}

class FakeAdmin {
  readonly rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  constructor(private readonly error: PgError = null) {}

  async rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    return { data: null, error: this.error };
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

function putRequest(modules: unknown): Request {
  return new Request('https://xidig.test/api/me/profile/modules', {
    method: 'PUT',
    body: JSON.stringify({ modules }),
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

describe('PUT /api/me/profile/modules — flag-gated modules (ruling 7 / A3)', () => {
  it('409s a visible:true on metrics while the flag is off, and writes nothing', async () => {
    const caller = new FakeCaller({ profile_metrics_module: false });
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await PUT(putRequest([{ moduleId: 'metrics', position: 1, visible: true }]));

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('module_flag_disabled');
    // The rejection is real: no set_profile_modules ever ran.
    expect(admin.rpcCalls).toEqual([]);
  });

  it('maps the trigger 42501 to the same 409 — the DB is the real boundary', async () => {
    // Flag reads ON (a stale answer, or a flag flipped off mid-request), so the
    // pre-check passes and only the trigger stands between the owner and a
    // published module.
    const caller = new FakeCaller({ profile_metrics_module: true });
    const admin = new FakeAdmin({ code: '42501', message: 'module_flag_disabled' });
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await PUT(putRequest([{ moduleId: 'metrics', position: 1, visible: true }]));

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('module_flag_disabled');
    expect(admin.rpcCalls).toHaveLength(1);
  });

  it('accepts metrics while it stays hidden — the flag gates publishing, not saving', async () => {
    const caller = new FakeCaller({ profile_metrics_module: false }, [
      { module_id: 'metrics', position: 1, visible: false },
    ]);
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await PUT(putRequest([{ moduleId: 'metrics', position: 1, visible: false }]));

    expect(response.status).toBe(200);
    expect(admin.rpcCalls[0]?.fn).toBe('set_profile_modules');
  });
});

describe('PUT /api/me/profile/modules — payload contract', () => {
  it('saves the array order verbatim and answers with all eight merged states', async () => {
    const caller = new FakeCaller({ profile_metrics_module: false }, [
      { module_id: 'skills', position: 1, visible: true },
      { module_id: 'showcase', position: 2, visible: false },
    ]);
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(caller);
    adminHolder.client = admin;

    const response = await PUT(
      putRequest([
        { moduleId: 'skills', position: 1, visible: true },
        { moduleId: 'showcase', position: 2, visible: false },
      ]),
    );
    const body = (await response.json()) as {
      data: { modules: Array<{ id: string; position: number; visible: boolean }> };
    };

    expect(response.status).toBe(200);
    expect(admin.rpcCalls[0]?.args['p_modules']).toEqual([
      { module_id: 'skills', position: 1, visible: true },
      { module_id: 'showcase', position: 2, visible: false },
    ]);
    // Modules the member never sent fall back to their seed defaults, so the
    // response is the whole page order, not the delta.
    expect(body.data.modules).toHaveLength(8);
    expect(body.data.modules.slice(0, 2).map((module) => module.id)).toEqual([
      'skills',
      'showcase',
    ]);
  });

  it('400s duplicate module ids and duplicate positions before touching the RPC', async () => {
    const admin = new FakeAdmin();
    authHolder.ctx = contextFor(new FakeCaller({ profile_metrics_module: false }));
    adminHolder.client = admin;

    const duplicateIds = await PUT(
      putRequest([
        { moduleId: 'skills', position: 1, visible: true },
        { moduleId: 'skills', position: 2, visible: true },
      ]),
    );
    expect(duplicateIds.status).toBe(400);

    const duplicatePositions = await PUT(
      putRequest([
        { moduleId: 'skills', position: 1, visible: true },
        { moduleId: 'links', position: 1, visible: true },
      ]),
    );
    expect(duplicatePositions.status).toBe(400);
    expect(admin.rpcCalls).toEqual([]);
  });

  it('400s an unknown module id — the registry is closed', async () => {
    authHolder.ctx = contextFor(new FakeCaller({ profile_metrics_module: false }));
    adminHolder.client = new FakeAdmin();

    const response = await PUT(putRequest([{ moduleId: 'followers', position: 1, visible: true }]));

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('invalid_request');
  });
});
