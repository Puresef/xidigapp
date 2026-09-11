import { describe, expect, it } from 'vitest';

import {
  isLiveAccount,
  isLiveStatus,
  LIVE_ACCOUNT_STATUSES,
  loadAccountFlags,
  type AccountFlags,
} from './account-flags';

describe('account flags', () => {
  it('fails closed for an unknown id', () => {
    const flags = new Map<string, AccountFlags>([['known', { status: 'active', isAi: false }]]);
    expect(isLiveAccount(flags, 'known')).toBe(true);
    expect(isLiveAccount(flags, 'unknown')).toBe(false);
  });

  // pending_deletion is the cancellable grace: ordinary membership until the
  // final transition (owner ruling, 11 Sep) — the same set as the database's
  // current_account_can_use_client_api() / author_is_active().
  it('the live set is exactly active + pending_deletion', () => {
    expect([...LIVE_ACCOUNT_STATUSES].sort()).toEqual(['active', 'pending_deletion']);
  });

  it.each(['active', 'pending_deletion'] as const)('treats %s as live', (status) => {
    const flags = new Map<string, AccountFlags>([['u', { status, isAi: false }]]);
    expect(isLiveAccount(flags, 'u')).toBe(true);
    expect(isLiveStatus(status)).toBe(true);
  });

  it.each(['suspended', 'deactivated', 'deleted'] as const)('treats %s as not live', (status) => {
    const flags = new Map<string, AccountFlags>([['u', { status, isAi: false }]]);
    expect(isLiveAccount(flags, 'u')).toBe(false);
    expect(isLiveStatus(status)).toBe(false);
  });

  it('an unknown or missing status is not live', () => {
    expect(isLiveStatus(undefined)).toBe(false);
    expect(isLiveStatus(null)).toBe(false);
  });

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
