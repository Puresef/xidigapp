import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/admin/verifier-grants. Granting the verifier capability to an
 * anonymised account is refused (409 account_deleted, nothing written);
 * REVOKING one stays allowed — cleaning up a departed verifier's grant is
 * exactly what an admin should be able to do.
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
    for (const op of ['select', 'eq', 'update', 'upsert']) q[op] = chain(op);
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

import { POST } from './route';

const TARGET = '11111111-1111-4111-8111-111111111111';

function request(action: 'grant' | 'revoke') {
  return new Request('https://app.xidig.net/api/admin/verifier-grants', {
    method: 'POST',
    body: JSON.stringify({ userId: TARGET, action }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(writeAudit).mockClear();
});

describe('verifier grants and a deleted account', () => {
  it('grant → 409 account_deleted, nothing written', async () => {
    const fake = fakeAdmin({ status: 'deleted' });
    state.admin = fake.admin;

    const response = await POST(request('grant'));

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'account_deleted',
    );
    expect(fake.writes).toEqual([]);
    expect(vi.mocked(writeAudit)).not.toHaveBeenCalled();
  });

  it('revoke still works on a deleted account', async () => {
    const fake = fakeAdmin({ status: 'deleted' });
    state.admin = fake.admin;

    const response = await POST(request('revoke'));

    expect(response.status).toBe(200);
    expect(fake.writes).toEqual(['update:verifier_grants']);
  });

  it('grant to a live account still works (control)', async () => {
    const fake = fakeAdmin({ status: 'active' });
    state.admin = fake.admin;

    const response = await POST(request('grant'));

    expect(response.status).toBe(200);
    expect(fake.writes).toEqual(['upsert:verifier_grants']);
  });
});
