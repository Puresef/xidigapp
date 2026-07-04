import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { SIGNUP_GRANT_TTL_MINUTES } from './constants';

/**
 * Signup grants: the server-issued permission that the auth.users trigger
 * requires before any account can be created (the beta gate's write side —
 * see the Phase 1 migration for the read side).
 *
 * One open grant per identifier: re-validating an invite refreshes the grant
 * rather than stacking new ones (delete-then-insert; the partial unique
 * index is the backstop under races).
 */
export async function issueSignupGrant(
  admin: SupabaseClient<Database>,
  opts: {
    email?: string;
    phone?: string;
    inviteId?: string;
    waitlistEntryId?: string;
  },
): Promise<void> {
  if (!opts.email && !opts.phone) {
    throw new Error('issueSignupGrant requires an email or phone');
  }

  let stale = admin.from('signup_grants').delete().is('consumed_at', null);
  stale = opts.email ? stale.eq('email', opts.email) : stale.eq('phone', opts.phone!);
  const { error: cleanupError } = await stale;
  if (cleanupError) {
    throw new Error(`Failed to clear stale signup grant: ${cleanupError.message}`);
  }

  const { error } = await admin.from('signup_grants').insert({
    email: opts.email ?? null,
    phone: opts.phone ?? null,
    invite_id: opts.inviteId ?? null,
    waitlist_entry_id: opts.waitlistEntryId ?? null,
    expires_at: new Date(Date.now() + SIGNUP_GRANT_TTL_MINUTES * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(`Failed to issue signup grant: ${error.message}`);
}
