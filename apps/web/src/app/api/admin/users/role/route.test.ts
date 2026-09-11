import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH /api/admin/users/role on an account that has since been anonymised:
 * a role on a tombstone means nothing and must not be written — 409
 * account_deleted, no update, no audit row claiming a change.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({ admin: null as unknown }));

function fakeAdmin(subject: Row | null) {
  const writes: string[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain =
      (op: string) =>
      (..._args: unknown[]) => {
        if (op === 'update' || op === 'insert' || op === 'upsert') writes.push(`${op}:${table}`);
        return q;
      };
    for (const op of ['select', 'eq', 'update']) q[op] = chain(op);
    q.maybeSingle = async () => ({ data: table === 'users' ? subject : null, error: null });
    q.then = (ok: (v: unknown) => unknown, bad: (r: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(ok, bad);
    return q;
  };
  return { admin: { from } as never, writes };
}

vi.mock('@/lib/auth/guards', () => ({
  requireRole: async () => ({ appUser: { id: '99999999-9999-4999-8999-999999999999' } }),
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => state.admin }));
vi.mock('@/lib/audit', () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));

import { writeAudit } from '@/lib/audit';

import { PATCH } from './route';

const TARGET = '11111111-1111-4111-8111-111111111111';

function request(role: string) {
  return new Request('https://app.xidig.net/api/admin/users/role', {
    method: 'PATCH',
    body: JSON.stringify({ userId: TARGET, role }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(writeAudit).mockClear();
});

describe('role change on a deleted account', () => {
  it('409 account_deleted — no update, no audit', async () => {
    const fake = fakeAdmin({ id: TARGET, role: 'member', status: 'deleted' });
    state.admin = fake.admin;

    const response = await PATCH(request('mod'));

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'account_deleted',
    );
    expect(fake.writes).toEqual([]);
    expect(vi.mocked(writeAudit)).not.toHaveBeenCalled();
  });

  it('a live account’s role still changes (control)', async () => {
    const fake = fakeAdmin({ id: TARGET, role: 'member', status: 'active' });
    state.admin = fake.admin;

    const response = await PATCH(request('mod'));

    expect(response.status).toBe(200);
    expect(fake.writes).toEqual(['update:users']);
    expect(vi.mocked(writeAudit)).toHaveBeenCalledTimes(1);
  });
});
