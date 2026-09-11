import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

import { applyModAction } from './actions';

/**
 * suspend_user must never touch an anonymised account. unsuspend_user only
 * acts on 'suspended' (that guard existed), so a suspend that landed on a
 * 'deleted' row would have made deleted → suspended → active reachable in two
 * moderator clicks — a reactivation the lifecycle never allows. The UPDATE
 * carries `status <> 'deleted'` and a zero-row result is a hard failure before
 * any mod_actions row, notification or audit is written.
 *
 * Every USER-STATE action (suspend, unsuspend, warn, verify, revoke) now also
 * reads the subject's status first: a deleted subject is a 409
 * `account_deleted` — previously the suspend refusal was a plain Error (500)
 * and a warn/unsuspend on a tombstone wrote an immutable mod_actions row and
 * notified it. Content actions are untouched: moderators still moderate
 * retained content by deleted authors.
 */

const notify = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));
vi.mock('@/lib/notifications/notify', () => ({
  insertNotification: async (_a: unknown, n: unknown) => {
    notify.calls.push(n);
  },
}));

type Row = Record<string, unknown>;

/**
 * `subject` answers the pre-check (select status); `afterUpdate` answers the
 * users UPDATE … RETURNING; `post` answers a content lookup.
 */
function fakeAdmin(
  opts: { subject?: Row | null; afterUpdate?: Row | null; post?: Row | null } = {},
) {
  const writes: string[] = [];
  const recorded: Array<{ table: string; op: string; args: unknown[] }> = [];
  const make = (table: string) => {
    const ops: string[] = [];
    const q: Record<string, unknown> = {};
    const chain =
      (op: string) =>
      (...args: unknown[]) => {
        ops.push(op);
        recorded.push({ table, op, args });
        if (op === 'insert') writes.push(table);
        if (op === 'update') writes.push(`update:${table}`);
        return q;
      };
    for (const op of ['update', 'insert', 'select', 'eq', 'neq', 'maybeSingle']) q[op] = chain(op);
    q.then = <T1, T2>(
      onfulfilled?: ((v: { data: Row | null; error: null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
    ) => {
      let data: Row | null = null;
      if (table === 'users') {
        data = ops.includes('update') ? (opts.afterUpdate ?? null) : (opts.subject ?? null);
      } else if (table === 'posts') {
        data = opts.post ?? null;
      }
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    };
    return q;
  };
  return { admin: { from: make } as never, writes, recorded };
}

const input = {
  actorUserId: 'mod-1',
  action: 'suspend_user' as const,
  targetType: 'user' as const,
  targetId: 'target-1',
  reason: 'spam',
};

describe('applyModAction suspend_user', () => {
  it('refuses to suspend an anonymised account with 409 account_deleted and records nothing', async () => {
    notify.calls.length = 0;
    const { admin, writes } = fakeAdmin({ subject: { status: 'deleted' } });
    const error = await applyModAction(admin, input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'account_deleted', status: 409 });
    expect(writes).toEqual([]);
    expect(notify.calls).toEqual([]);
  });

  it('refuses an unknown account with 404 and records nothing', async () => {
    const { admin, writes } = fakeAdmin({ subject: null });
    await expect(applyModAction(admin, input)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
    expect(writes).toEqual([]);
  });

  it('keeps the race backstop: a deletion landing between check and UPDATE still records nothing', async () => {
    const { admin, writes, recorded } = fakeAdmin({
      subject: { status: 'active' },
      afterUpdate: null,
    });
    await expect(applyModAction(admin, input)).rejects.toThrow(/anonymised or does not exist/);
    expect(writes).toEqual(['update:users']);
    const neq = recorded.find((r) => r.table === 'users' && r.op === 'neq');
    expect(neq?.args).toEqual(['status', 'deleted']);
  });

  it('suspends a live account and records the mod action', async () => {
    const { admin, writes } = fakeAdmin({
      subject: { status: 'active' },
      afterUpdate: { id: 'target-1' },
    });
    const result = await applyModAction(admin, input);
    expect(result.affectedUserId).toBe('target-1');
    expect(writes).toEqual(['update:users', 'mod_actions']);
  });
});

describe('every user-state action refuses a deleted subject before writing', () => {
  it.each(['unsuspend_user', 'warn_user', 'verify_user', 'revoke_verification'] as const)(
    '%s on a deleted account → 409, no mod_actions row, no notification',
    async (action) => {
      notify.calls.length = 0;
      const { admin, writes } = fakeAdmin({ subject: { status: 'deleted' } });
      await expect(applyModAction(admin, { ...input, action })).rejects.toMatchObject({
        code: 'account_deleted',
        status: 409,
      });
      expect(writes).toEqual([]);
      expect(notify.calls).toEqual([]);
    },
  );

  it('a warning to a live member still records and notifies', async () => {
    notify.calls.length = 0;
    const { admin, writes } = fakeAdmin({ subject: { status: 'active' } });
    await applyModAction(admin, { ...input, action: 'warn_user' });
    expect(writes).toEqual(['mod_actions']);
    expect(notify.calls).toHaveLength(1);
  });
});

describe('content actions are not subject-gated', () => {
  it('a mod can still remove a deleted author’s retained post (no user pre-check)', async () => {
    const { admin, writes, recorded } = fakeAdmin({ post: { author_user_id: 'gone-1' } });
    await applyModAction(admin, {
      actorUserId: 'mod-1',
      action: 'remove_content',
      targetType: 'post',
      targetId: 'post-1',
    });
    expect(writes).toEqual(['update:posts', 'mod_actions']);
    expect(recorded.some((r) => r.table === 'users')).toBe(false);
  });
});
