import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/me/account — the lifecycle state machine at the wire.
 *
 * Every transition used to filter its UPDATE by id only and trust a status
 * snapshot read before the write. Under a concurrent grace sweep that made
 * cancel_deletion a hidden 'deleted' → 'active' reactivation (or a 500 from a
 * CHECK violation). Now every UPDATE carries its precondition in the WHERE
 * clause and a zero-row result is a precise refusal, never a silent no-op and
 * never a state change the snapshot did not authorise.
 */

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: Row | null; error: null }> {
  readonly recorded: Array<{ op: string; args: unknown[] }> = [];
  constructor(private readonly row: Row | null) {}
  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }
  update(v: Row) {
    return this.chain('update', [v]);
  }
  select(c: string) {
    return this.chain('select', [c]);
  }
  eq(c: string, v: unknown) {
    return this.chain('eq', [c, v]);
  }
  in(c: string, v: unknown[]) {
    return this.chain('in', [c, v]);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  argsOf(op: string) {
    return this.recorded.find((r) => r.op === op)?.args;
  }
  then<T1, T2>(
    onfulfilled?: ((v: { data: Row | null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.row, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeAdmin {
  readonly queries: FakeQuery[] = [];
  constructor(private readonly matched: boolean) {}
  from(_table: string) {
    const q = new FakeQuery(this.matched ? { id: 'me' } : null);
    this.queries.push(q);
    return q;
  }
}

const auth = vi.hoisted(() => ({ ctx: null as unknown }));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const audits = vi.hoisted(() => ({ actions: [] as string[] }));

vi.mock('@/lib/auth/guards', () => ({ getAuthContext: async () => auth.ctx }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => adminHolder.client }));
vi.mock('@/lib/audit', () => ({
  writeAudit: async (_a: unknown, entry: { action: string }) => {
    audits.actions.push(entry.action);
  },
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => {} }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { POST } from './route';

function ctxWith(status: string) {
  return { user: { id: 'me' }, appUser: { id: 'me', status, role: 'member' }, supabase: null };
}
function post(action: string) {
  return new Request('https://app.xidig.net/api/me/account', {
    method: 'POST',
    body: JSON.stringify({ action }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  audits.actions.length = 0;
});

describe('every transition re-checks the state in its WHERE clause', () => {
  it.each([
    ['deactivate', 'active', ['status', 'active'], null],
    ['reactivate', 'deactivated', ['status', 'deactivated'], null],
    ['cancel_deletion', 'pending_deletion', ['status', 'pending_deletion'], null],
    ['request_deletion', 'active', null, ['status', ['active', 'deactivated']]],
  ])('%s from %s carries its precondition', async (action, status, eqArgs, inArgs) => {
    auth.ctx = ctxWith(status);
    const admin = new FakeAdmin(true);
    adminHolder.client = admin;
    const res = await POST(post(action));
    expect(res.status).toBe(200);
    const q = admin.queries[0]!;
    expect(q.argsOf('eq')).toEqual(['id', 'me']);
    const statusEq = q.recorded.filter((r) => r.op === 'eq')[1]?.args ?? null;
    expect(statusEq).toEqual(eqArgs);
    expect(q.argsOf('in') ?? null).toEqual(inArgs);
    expect(q.argsOf('select')).toEqual(['id']);
  });
});

describe('a state that moved underneath the request is refused, not overwritten', () => {
  it('cancel_deletion after the sweep already anonymised the account → 400, no audit', async () => {
    // The snapshot still says pending_deletion, but the DB row is 'deleted':
    // the predicate matches nothing. This is the hidden-reactivation path.
    auth.ctx = ctxWith('pending_deletion');
    adminHolder.client = new FakeAdmin(false);
    const res = await POST(post('cancel_deletion'));
    expect(res.status).toBe(400);
    expect(audits.actions).toEqual([]);
  });

  it('request_deletion when the row already moved → 409', async () => {
    auth.ctx = ctxWith('active');
    adminHolder.client = new FakeAdmin(false);
    expect((await POST(post('request_deletion'))).status).toBe(409);
    expect(audits.actions).toEqual([]);
  });

  it('reactivate when the row already moved → 400', async () => {
    auth.ctx = ctxWith('deactivated');
    adminHolder.client = new FakeAdmin(false);
    expect((await POST(post('reactivate'))).status).toBe(400);
  });

  it('deactivate when the row already moved → 403', async () => {
    auth.ctx = ctxWith('active');
    adminHolder.client = new FakeAdmin(false);
    expect((await POST(post('deactivate'))).status).toBe(403);
  });
});

describe('the snapshot still drives the precise §27 code', () => {
  it('cancel_deletion from a non-pending snapshot is 400 without touching the DB', async () => {
    auth.ctx = ctxWith('deleted');
    const admin = new FakeAdmin(true);
    adminHolder.client = admin;
    expect((await POST(post('cancel_deletion'))).status).toBe(400);
    expect(admin.queries).toHaveLength(0);
  });

  it('a successful cancel writes its audit row', async () => {
    auth.ctx = ctxWith('pending_deletion');
    adminHolder.client = new FakeAdmin(true);
    expect((await POST(post('cancel_deletion'))).status).toBe(200);
    expect(audits.actions).toEqual(['user.deletion.cancel']);
  });
});
