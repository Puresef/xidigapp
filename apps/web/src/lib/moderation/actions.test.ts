import { describe, expect, it, vi } from 'vitest';

import { applyModAction } from './actions';

/**
 * suspend_user must never touch an anonymised account. unsuspend_user only
 * acts on 'suspended' (that guard existed), so a suspend that landed on a
 * 'deleted' row would have made deleted → suspended → active reachable in two
 * moderator clicks — a reactivation the lifecycle never allows. The UPDATE now
 * carries `status <> 'deleted'` and a zero-row result is a hard failure before
 * any mod_actions row, notification or audit is written.
 */

vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));
vi.mock('@/lib/notifications/notify', () => ({ insertNotification: async () => {} }));

type Row = Record<string, unknown>;

function fakeAdmin(usersRowAfterUpdate: Row | null) {
  const writes: string[] = [];
  const recorded: Array<{ table: string; op: string; args: unknown[] }> = [];
  const make = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain =
      (op: string) =>
      (...args: unknown[]) => {
        recorded.push({ table, op, args });
        if (op === 'insert') writes.push(table);
        return q;
      };
    for (const op of ['update', 'insert', 'select', 'eq', 'neq', 'maybeSingle']) q[op] = chain(op);
    q.then = <T1, T2>(
      onfulfilled?: ((v: { data: Row | null; error: null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
    ) =>
      Promise.resolve({ data: table === 'users' ? usersRowAfterUpdate : null, error: null }).then(
        onfulfilled,
        onrejected,
      );
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
  it('refuses to suspend an anonymised (or missing) account and records nothing', async () => {
    const { admin, writes, recorded } = fakeAdmin(null);
    await expect(applyModAction(admin, input)).rejects.toThrow(/anonymised or does not exist/);
    expect(writes).toEqual([]);
    const neq = recorded.find((r) => r.table === 'users' && r.op === 'neq');
    expect(neq?.args).toEqual(['status', 'deleted']);
  });

  it('suspends a live account and records the mod action', async () => {
    const { admin, writes } = fakeAdmin({ id: 'target-1' });
    const result = await applyModAction(admin, input);
    expect(result.affectedUserId).toBe('target-1');
    expect(writes).toEqual(['mod_actions']);
  });
});
