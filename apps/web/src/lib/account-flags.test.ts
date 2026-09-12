import { describe, expect, it } from 'vitest';

import {
  isLiveAccount,
  isLiveStatus,
  isOrganicAccount,
  isTestAccount,
  LIVE_ACCOUNT_STATUSES,
  loadAccountFlags,
  loadTestAccountIds,
  postgrestIdList,
  type AccountFlags,
} from './account-flags';

describe('account flags', () => {
  it('fails closed for an unknown id', () => {
    const flags = new Map<string, AccountFlags>([['known', { status: 'active', isAi: false, isTest: false }]]);
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
    const flags = new Map<string, AccountFlags>([['u', { status, isAi: false, isTest: false }]]);
    expect(isLiveAccount(flags, 'u')).toBe(true);
    expect(isLiveStatus(status)).toBe(true);
  });

  it.each(['suspended', 'deactivated', 'deleted'] as const)('treats %s as not live', (status) => {
    const flags = new Map<string, AccountFlags>([['u', { status, isAi: false, isTest: false }]]);
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
            return {
              data: ids.map((id) => ({ id, status: 'active', is_ai: false, is_test: id === 'b' })),
              error: null,
            };
          },
        }),
      }),
    } as never;
    expect((await loadAccountFlags(admin, [])).size).toBe(0);
    expect(seen).toEqual([]);
    const flags = await loadAccountFlags(admin, ['a', 'a', 'b']);
    expect(seen).toEqual([['a', 'b']]);
    expect(flags.size).toBe(2);
    expect(flags.get('a')?.isTest).toBe(false);
    expect(flags.get('b')?.isTest).toBe(true);
  });

  it('selects is_test alongside status and is_ai', async () => {
    let selected = '';
    const admin = {
      from: () => ({
        select: (cols: string) => {
          selected = cols;
          return { in: async () => ({ data: [], error: null }) };
        },
      }),
    } as never;
    await loadAccountFlags(admin, ['x']);
    expect(selected.split(',').map((c) => c.trim())).toEqual(['id', 'status', 'is_ai', 'is_test']);
  });
});

describe('test-account quarantine helpers', () => {
  const flags = new Map<string, AccountFlags>([
    ['real', { status: 'active', isAi: false, isTest: false }],
    ['fixture', { status: 'active', isAi: false, isTest: true }],
    ['graceTest', { status: 'pending_deletion', isAi: false, isTest: true }],
    ['ai', { status: 'active', isAi: true, isTest: false }],
    ['gone', { status: 'deleted', isAi: false, isTest: false }],
  ]);

  it('isTestAccount is true only for a marked account', () => {
    expect(isTestAccount(flags, 'fixture')).toBe(true);
    expect(isTestAccount(flags, 'graceTest')).toBe(true);
    expect(isTestAccount(flags, 'real')).toBe(false);
    expect(isTestAccount(flags, 'unknown')).toBe(false);
  });

  it('isOrganicAccount = live AND not a test account; unknown fails closed', () => {
    expect(isOrganicAccount(flags, 'real')).toBe(true);
    expect(isOrganicAccount(flags, 'ai')).toBe(true); // AI is labelled, not a test account
    expect(isOrganicAccount(flags, 'fixture')).toBe(false);
    expect(isOrganicAccount(flags, 'graceTest')).toBe(false);
    expect(isOrganicAccount(flags, 'gone')).toBe(false);
    expect(isOrganicAccount(flags, 'unknown')).toBe(false);
  });

  it('loadTestAccountIds reads only users.is_test = true and throws on error', async () => {
    const calls: unknown[] = [];
    const admin = {
      from: (table: string) => ({
        select: (cols: string) => ({
          eq: async (col: string, value: unknown) => {
            calls.push([table, cols, col, value]);
            return { data: [{ id: 't1' }, { id: 't2' }], error: null };
          },
        }),
      }),
    } as never;
    expect(await loadTestAccountIds(admin)).toEqual(['t1', 't2']);
    expect(calls).toEqual([['users', 'id', 'is_test', true]]);

    const failing = {
      from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'boom' } }) }) }),
    } as never;
    await expect(loadTestAccountIds(failing)).rejects.toThrow(/test account lookup failed/);
  });

  it('postgrestIdList builds a PostgREST list literal', () => {
    expect(postgrestIdList(['a', 'b'])).toBe('(a,b)');
  });
});
