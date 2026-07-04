import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { PRIVACY_VERSION, TERMS_VERSION } from './constants';

/**
 * Consent capture at signup (§12: ToS + Privacy required before Phase 1 data
 * collection; consent_records design in the Phase 0 notes). The signup API
 * refuses to proceed unless terms were accepted, then records both documents
 * here once the account exists.
 */
export async function recordSignupConsents(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { error } = await admin.from('consent_records').insert([
    {
      user_id: userId,
      consent_type: 'terms_of_service',
      version: TERMS_VERSION,
      method: 'signup',
    },
    {
      user_id: userId,
      consent_type: 'privacy_policy',
      version: PRIVACY_VERSION,
      method: 'signup',
    },
  ]);
  if (error) {
    // Consent recording must never fail silently — it's the §12 legal floor.
    throw new Error(`Failed to record signup consents: ${error.message}`);
  }
}
