import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * Account-state guard semantics (§19/§26). The load-bearing contract:
 *
 *   * requireUser BLOCKS suspended accounts (ordinary application access);
 *   * requireUserForAppeal admits suspended accounts — the appeal route is
 *     the one promised resolution path, and the member most likely to need
 *     it is the one requireUser locks out — while keeping every OTHER
 *     account-state rule identical (signed-out 401, deactivated/deleted 403,
 *     pending_deletion grace admitted).
 *
 * Pinned here so a future "simplification" that re-unifies the two guards
 * fails a test instead of silently re-breaking suspended appeals (the page
 * at /support/appeal already admits suspended members by design).
 */

const serverHolder = vi.hoisted(() => ({
  authUser: null as { id: string } | null,
  appUser: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({ data: { user: serverHolder.authUser } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: serverHolder.appUser }),
        }),
      }),
    }),
  }),
}));

import { requireUser, requireUserForAppeal } from './guards';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function signIn(status: string) {
  serverHolder.authUser = { id: USER_ID };
  serverHolder.appUser = { id: USER_ID, role: 'member', status };
}

async function statusOf(fn: () => Promise<unknown>): Promise<number | 'ok'> {
  try {
    await fn();
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError) return error.status;
    throw error;
  }
}

beforeEach(() => {
  serverHolder.authUser = null;
  serverHolder.appUser = null;
});

describe('requireUser vs requireUserForAppeal account states', () => {
  it('both refuse a signed-out caller with 401', async () => {
    expect(await statusOf(requireUser)).toBe(401);
    expect(await statusOf(requireUserForAppeal)).toBe(401);
  });

  it('suspended: requireUser 403s (account_suspended) but the appeal guard admits', async () => {
    signIn('suspended');
    await expect(requireUser()).rejects.toMatchObject({ code: 'account_suspended', status: 403 });
    const ctx = await requireUserForAppeal();
    expect(ctx.appUser).toMatchObject({ id: USER_ID, status: 'suspended' });
  });

  it('deactivated and deleted are refused by BOTH guards', async () => {
    for (const status of ['deactivated', 'deleted']) {
      signIn(status);
      expect(await statusOf(requireUser)).toBe(403);
      expect(await statusOf(requireUserForAppeal)).toBe(403);
    }
  });

  it('active and pending_deletion pass BOTH guards', async () => {
    for (const status of ['active', 'pending_deletion']) {
      signIn(status);
      expect(await statusOf(requireUser)).toBe('ok');
      expect(await statusOf(requireUserForAppeal)).toBe('ok');
    }
  });
});
