import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ApiError } from '@/lib/api';

import { getEmailProvider, type OutgoingEmail } from './provider';

/**
 * Centralized, suppression-checked email send. EVERY auth email goes through
 * here: addresses that hard-bounced or complained (email_suppressions, fed
 * by /api/webhooks/email) are refused up front with the §27
 * email_undeliverable copy instead of sending into a black hole and telling
 * the member to "check your inbox".
 *
 * Fail-open on the suppression LOOKUP (a read error must not block auth
 * email), fail-closed on a positive suppression hit.
 */
export async function sendEmailChecked(
  admin: SupabaseClient<Database>,
  outgoing: OutgoingEmail,
): Promise<void> {
  try {
    const { data } = await admin
      .from('email_suppressions')
      .select('email')
      .eq('email', outgoing.to)
      .is('released_at', null)
      .maybeSingle();
    if (data) throw new ApiError('email_undeliverable', 422);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.warn('[email] suppression lookup failed — sending anyway:', error);
  }

  await getEmailProvider().send(outgoing);
}
