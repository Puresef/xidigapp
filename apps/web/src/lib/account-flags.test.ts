import { describe, expect, it } from 'vitest';

import { isActiveAccount, loadAccountFlags, type AccountFlags } from './account-flags';

describe('account flags', () => {
  it('fails closed for an unknown id', () => {
    const flags = new Map<string, AccountFlags>([['known', { status: 'active', isAi: false }]]);
    expect(isActiveAccount(flags, 'known')).toBe(true);
    expect(isActiveAccount(flags, 'unknown')).toBe(false);
  });

  it.each(['suspended', 'deactivated', 'pending_deletion', 'deleted'] as const)(
    'treats %s as not active',
    (status) => {
      const flags = new Map<string, AccountFlags>([['u', { status, isAi: false }]]);
      expect(isActiveAccount(flags, 'u')).toBe(false);
    },
  );

  it('dedupes ids and skips the round trip for an empty set', async () => {
    const seen: unknown[] = [];
    const admin = {
      from: () => ({
        select: () => ({
          in: async (_c: string, ids: string[]) => {
            seen.push(ids);
            return { data: ids.map((id) => ({ id, status: 'active', is_ai: false })), error: null };
          },
        }),
      }),
    } as never;
    expect((await loadAccountFlags(admin, [])).size).toBe(0);
    expect(seen).toEqual([]);
    const flags = await loadAccountFlags(admin, ['a', 'a', 'b']);
    expect(seen).toEqual([['a', 'b']]);
    expect(flags.size).toBe(2);
  });
});
