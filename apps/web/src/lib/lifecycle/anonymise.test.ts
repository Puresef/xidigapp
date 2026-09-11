import { describe, expect, it } from 'vitest';

import { anonymiseUser } from './anonymise';

/**
 * The app-side wrapper is deliberately thin: every rule lives in the
 * transactional RPC (packages/db/src/account-deletion-privacy.test.ts pins
 * those). What this file pins is the seam — the exact RPC and argument, the
 * outcome mapping, and that a driver error is rethrown (so the sweep counts a
 * failure and retries next run) rather than swallowed.
 */

type RpcResult = { data: unknown; error: { message: string } | null };

function fakeAdmin(result: RpcResult) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return result;
      },
    } as never,
  };
}

describe('anonymiseUser', () => {
  it('calls the transactional RPC with the user id', async () => {
    const { admin, calls } = fakeAdmin({
      data: { outcome: 'anonymised', media_pending: 2 },
      error: null,
    });
    const out = await anonymiseUser(admin, 'u-1');
    expect(calls).toEqual([{ fn: 'anonymise_user', args: { p_user_id: 'u-1' } }]);
    expect(out).toEqual({ outcome: 'anonymised', mediaPending: 2 });
  });

  it.each([
    [{ outcome: 'already_deleted' }, { outcome: 'already_deleted' }],
    [
      { outcome: 'skipped', status: 'active' },
      { outcome: 'skipped', status: 'active' },
    ],
    [{ outcome: 'not_found' }, { outcome: 'not_found' }],
  ])('maps %o to %o', async (data, expected) => {
    const { admin } = fakeAdmin({ data, error: null });
    expect(await anonymiseUser(admin, 'u-1')).toEqual(expected);
  });

  it('rethrows a driver error so the caller records a failure', async () => {
    const { admin } = fakeAdmin({ data: null, error: { message: 'connection reset' } });
    await expect(anonymiseUser(admin, 'u-1')).rejects.toThrow(
      /user anonymise failed: connection reset/,
    );
  });

  it('refuses an outcome it does not recognise', async () => {
    const { admin } = fakeAdmin({ data: { outcome: 'something_new' }, error: null });
    await expect(anonymiseUser(admin, 'u-1')).rejects.toThrow(/unknown outcome/);
  });
});
