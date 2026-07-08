import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { writeAudit } from '@/lib/audit';

/**
 * §19 anonymise-not-delete: irreversibly strip a member's identity while
 * preserving the legal / counterparty record. We NEVER touch audit_logs,
 * mod_actions, governance entries, vouches, or the counterparty side of DM
 * threads — those carry a separate retention obligation.
 *
 * The users row is the critical step (it flips status to 'deleted' and drops
 * the contact identifiers in ONE update — the users_contact_method CHECK only
 * permits null email + null phone when status='deleted', so they cannot be
 * split across statements). The profile scrub is best-effort on top: a failure
 * there still leaves the account deactivated + audited rather than aborting the
 * whole run.
 */

type Admin = SupabaseClient<Database>;

export async function anonymiseUser(admin: Admin, userId: string): Promise<void> {
  // Critical step: flip to 'deleted' and null the contact identifiers together
  // (the CHECK constraint forbids null email/phone unless status='deleted').
  const { error: userError } = await admin
    .from('users')
    .update({
      status: 'deleted',
      email: null,
      phone: null,
      anonymised_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (userError) throw new Error(`user anonymise failed: ${userError.message}`);

  // Best-effort profile scrub — the handle stays unique + regex-valid
  // (^[a-z0-9_]{3,30}$) by deriving it from the id.
  const scrubbedHandle = `deleted_${userId.replace(/-/g, '').slice(0, 12)}`;
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      display_name: 'Deleted member',
      handle: scrubbedHandle,
      bio: null,
      location_city: null,
      location_country: null,
      latitude: null,
      longitude: null,
      timezone: null,
      skills: [],
      lanes: [],
      links: [] as never,
      contact_options: {} as never,
    })
    .eq('user_id', userId);
  if (profileError) {
    // Non-fatal: the identity-bearing users row is already scrubbed + will be
    // audited below; a leftover profile field is a cleanup chore, not a breach.
    console.error(`[lifecycle] profile scrub failed for ${userId}:`, profileError.message);
  }

  await writeAudit(admin, {
    actorUserId: null,
    action: 'user.anonymised',
    targetType: 'user',
    targetId: userId,
  });
}
