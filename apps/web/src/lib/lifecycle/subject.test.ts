import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';

import { assertSubjectNotDeleted, loadSubjectStatus } from './subject';

/**
 * Admin and verification decisions act on a SUBJECT member who may have been
 * anonymised since the queue item was created. The status is read through
 * the trusted service-role client — never the caller's own session — and a
 * deleted subject is a 409 `account_deleted` before anything is written.
 */

function adminReturning(row: { status: string } | null, error: { message: string } | null = null) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const q: Record<string, unknown> = {};
  for (const op of ['select', 'eq']) {
    q[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return q;
    };
  }
  q.maybeSingle = async () => ({ data: row, error });
  return {
    admin: {
      from: (table: string) => {
        calls.push({ op: 'from', args: [table] });
        return q;
      },
    } as never,
    calls,
  };
}

const SUBJECT = '11111111-1111-4111-8111-111111111111';

describe('loadSubjectStatus', () => {
  it('reads users.status for exactly that id', async () => {
    const { admin, calls } = adminReturning({ status: 'active' });
    expect(await loadSubjectStatus(admin, SUBJECT)).toBe('active');
    expect(calls).toContainEqual({ op: 'from', args: ['users'] });
    expect(calls).toContainEqual({ op: 'select', args: ['status'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['id', SUBJECT] });
  });

  it('is null for an id with no account', async () => {
    const { admin } = adminReturning(null);
    expect(await loadSubjectStatus(admin, SUBJECT)).toBeNull();
  });

  it('throws on a lookup failure rather than guessing', async () => {
    const { admin } = adminReturning(null, { message: 'boom' });
    await expect(loadSubjectStatus(admin, SUBJECT)).rejects.toThrow(/subject status lookup failed/);
  });
});

describe('assertSubjectNotDeleted', () => {
  it.each(['active', 'pending_deletion', 'suspended', 'deactivated'])(
    'lets a %s subject through (only deletion is this guard’s concern)',
    async (status) => {
      const { admin } = adminReturning({ status });
      await expect(assertSubjectNotDeleted(admin, SUBJECT)).resolves.toBe(status);
    },
  );

  it('refuses a deleted subject with 409 account_deleted', async () => {
    const { admin } = adminReturning({ status: 'deleted' });
    const error = await assertSubjectNotDeleted(admin, SUBJECT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'account_deleted', status: 409 });
  });

  it('refuses an unknown subject with 404 not_found', async () => {
    const { admin } = adminReturning(null);
    await expect(assertSubjectNotDeleted(admin, SUBJECT)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });
});
