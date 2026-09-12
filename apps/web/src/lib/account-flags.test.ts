import { describe, expect, it } from 'vitest';

import {
  isTestAccount,
  loadAccountFlags,
  loadTestAccountIds,
  postgrestIdList,
  type AccountFlags,
} from './account-flags';

describe('account flags', () => {
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

  it('throws on a lookup error (a proof surface must not guess)', async () => {
    const failing = {
      from: () => ({
        select: () => ({ in: async () => ({ data: null, error: { message: 'no column' } }) }),
      }),
    } as never;
    await expect(loadAccountFlags(failing, ['x'])).rejects.toThrow(/account flags lookup failed/);
  });
});

describe('test-account quarantine helpers', () => {
  const flags = new Map<string, AccountFlags>([
    ['real', { status: 'active', isAi: false, isTest: false }],
    ['fixture', { status: 'active', isAi: false, isTest: true }],
    ['ai', { status: 'active', isAi: true, isTest: false }],
  ]);

  it('isTestAccount is true only for a marked account', () => {
    expect(isTestAccount(flags, 'fixture')).toBe(true);
    expect(isTestAccount(flags, 'real')).toBe(false);
    expect(isTestAccount(flags, 'ai')).toBe(false);
    expect(isTestAccount(flags, 'unknown')).toBe(false);
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
      from: () => ({
        select: () => ({ eq: async () => ({ data: null, error: { message: 'boom' } }) }),
      }),
    } as never;
    await expect(loadTestAccountIds(failing)).rejects.toThrow(/test account lookup failed/);
  });

  it('postgrestIdList builds a PostgREST list literal', () => {
    expect(postgrestIdList(['a', 'b'])).toBe('(a,b)');
  });
});
