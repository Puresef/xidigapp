import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

import { startConversation } from './service';

vi.mock('@/env', () => ({ env: { APP_URL: 'http://localhost:3000' } }));

/**
 * Retained content — no new DM to a tombstone (owner ruling 11 Sep). A deleted
 * recipient is refused with 409 account_deleted BEFORE anything else is read
 * or written (no profile, block, privacy or conversation access). Suspended
 * and deactivated recipients are not this rule's concern: they pass the new
 * guard and meet the flow's existing checks, unchanged.
 */

function fakeAdmin(status: string | null) {
  const touched: string[] = [];
  const admin = {
    touched,
    from(table: string) {
      touched.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (table === 'users') return { data: status === null ? null : { status }, error: null };
          // Every later lookup finds nothing — the test only needs to know the
          // flow got PAST the lifecycle guard.
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
  return admin;
}

async function refusal(status: string | null): Promise<ApiError | null> {
  try {
    await startConversation(fakeAdmin(status) as never, 'me', 'them', 'salaan');
    return null;
  } catch (error) {
    return error instanceof ApiError ? error : null;
  }
}

describe('startConversation — tombstone recipients', () => {
  it('refuses a deleted recipient with 409 account_deleted, touching nothing but its status', async () => {
    const admin = fakeAdmin('deleted');
    await expect(startConversation(admin as never, 'me', 'them', 'salaan')).rejects.toMatchObject({
      code: 'account_deleted',
      status: 409,
    });
    expect(admin.touched).toEqual(['users']);
  });

  it('an unknown recipient is a plain 404', async () => {
    expect(await refusal(null)).toMatchObject({ code: 'not_found', status: 404 });
  });

  it.each(['active', 'pending_deletion', 'suspended', 'deactivated'])(
    '%s recipient passes the deletion guard (existing rules apply next)',
    async (status) => {
      const admin = fakeAdmin(status);
      const error = await startConversation(admin as never, 'me', 'them', 'salaan').catch(
        (e: unknown) => e,
      );
      // The fake has no profile row, so the EXISTING lookup 404s — proof the
      // flow went past the guard rather than being stopped by it.
      expect(error).toMatchObject({ code: 'not_found', status: 404 });
      expect(admin.touched).toEqual(['users', 'profiles']);
    },
  );
});
