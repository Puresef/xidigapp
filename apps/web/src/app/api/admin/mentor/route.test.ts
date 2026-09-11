import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/admin/mentor. Appointing an anonymised account as Mentor-in-
 * Residence would put a "Deleted member" on the public mentor surface, grant
 * it the advisor capability and award it a badge. Refused before any write:
 * 409 account_deleted.
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
    for (const op of ['select', 'eq', 'insert', 'upsert']) q[op] = chain(op);
    q.maybeSingle = async () => ({ data: table === 'users' ? subject : null, error: null });
    q.single = async () => ({ data: { id: 'residency-1' }, error: null });
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
vi.mock('@/lib/reputation/service', () => ({ awardBadge: vi.fn(async () => {}) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));

import { writeAudit } from '@/lib/audit';
import { awardBadge } from '@/lib/reputation/service';

import { POST } from './route';

const ADVISOR = '11111111-1111-4111-8111-111111111111';

function request() {
  return new Request('https://app.xidig.net/api/admin/mentor', {
    method: 'POST',
    body: JSON.stringify({
      advisorUserId: ADVISOR,
      period: '2026-Q4',
      startsOn: '2026-10-01',
      endsOn: '2026-12-31',
    }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(writeAudit).mockClear();
  vi.mocked(awardBadge).mockClear();
});

describe('mentor appointment of a deleted account', () => {
  it('409 account_deleted — no residency, no advisor grant, no badge, no audit', async () => {
    const fake = fakeAdmin({ status: 'deleted' });
    state.admin = fake.admin;

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'account_deleted',
    );
    expect(fake.writes).toEqual([]);
    expect(vi.mocked(awardBadge)).not.toHaveBeenCalled();
    expect(vi.mocked(writeAudit)).not.toHaveBeenCalled();
  });

  it('a live advisor is still appointed (control)', async () => {
    const fake = fakeAdmin({ status: 'active' });
    state.admin = fake.admin;

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(fake.writes).toEqual(['insert:mentor_residencies', 'upsert:advisor_grants']);
    expect(vi.mocked(awardBadge)).toHaveBeenCalledTimes(1);
  });
});
