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

import {
  requireActiveUser,
  requireRole,
  requireUser,
  requireUserForAppeal,
  requireVerifier,
} from './guards';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function signIn(status: string, role = 'member') {
  serverHolder.authUser = { id: USER_ID };
  serverHolder.appUser = { id: USER_ID, role, status };
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

/**
 * Platform privilege requires a fully ACTIVE account (owner ruling, 11 Sep):
 * the §19 deletion grace is ordinary membership, NOT continued moderation,
 * admin or verification power. The admin/mod API routes act through the
 * service role, so the database's active-only is_mod()/is_admin() never see
 * them — the guard is the only place this can hold.
 */
describe('privileged guards and the deletion grace', () => {
  it.each([
    ['mod', 'mod'],
    ['admin', 'admin'],
  ] as const)('requireRole(%s) refuses a %s in pending_deletion with 403', async (min, role) => {
    signIn('pending_deletion', role);
    await expect(requireRole(min)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('an admin in pending_deletion cannot act as a verifier either', async () => {
    signIn('pending_deletion', 'admin');
    await expect(requireVerifier()).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('active mods and admins keep their powers (control)', async () => {
    signIn('active', 'mod');
    expect(await statusOf(() => requireRole('mod'))).toBe('ok');
    signIn('active', 'admin');
    expect(await statusOf(() => requireRole('admin'))).toBe('ok');
    expect(await statusOf(requireVerifier)).toBe('ok');
  });

  it('the grace member is still an ordinary member (requireUser admits)', async () => {
    signIn('pending_deletion', 'admin');
    expect(await statusOf(requireUser)).toBe('ok');
  });
});

/**
 * requireActiveUser — for escalations and capital/governance-sensitive writes
 * (Lab→Candidate handoff, candidate submit, Venture promotion, every venture
 * ledger/board/capital write). Owner ruling, 11 Sep: those require an ACTIVE
 * account; the grace keeps ordinary member access (requireUser) but not these.
 */
describe('requireActiveUser', () => {
  it('admits an active member of any role', async () => {
    for (const role of ['member', 'mod', 'admin']) {
      signIn('active', role);
      expect(await statusOf(requireActiveUser)).toBe('ok');
    }
  });

  it('refuses the grace with 403 forbidden', async () => {
    signIn('pending_deletion');
    await expect(requireActiveUser()).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it('keeps requireUser semantics for every other state', async () => {
    expect(await statusOf(requireActiveUser)).toBe(401);
    signIn('suspended');
    await expect(requireActiveUser()).rejects.toMatchObject({
      code: 'account_suspended',
      status: 403,
    });
    for (const status of ['deactivated', 'deleted']) {
      signIn(status);
      expect(await statusOf(requireActiveUser)).toBe(403);
    }
  });
});
