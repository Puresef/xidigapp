import {
  CONSENT_VERSION,
  decideConsent,
  parseConsentCookie,
  type ActiveConsentRecord,
  type ConsentCategory,
  type ConsentState,
} from './model';

/**
 * Server-side consent resolution for the signed-in shell (layout + settings).
 *
 * Fast path: a cookie stamped with the CURRENT version answers without
 * touching the DB — after a member acts once, every subsequent render is
 * cookie-only. The DB is consulted only for members with no current-version
 * cookie (new device, cleared cookies, or a version bump), i.e. exactly the
 * renders where a prompt might be due.
 *
 * Fail-closed on lookup error: needsPrompt=false AND both flags false — we
 * never show a banner (or enable capture) because of a DB blip. The admin
 * client is imported lazily for the same reason as lib/analytics/consent.ts:
 * keep this module unit-testable and out of eager import graphs.
 */
export async function getConsentChoice(
  userId: string,
  cookieValue: string | null | undefined,
): Promise<ConsentState> {
  const cookie = parseConsentCookie(cookieValue);
  if (cookie?.version === CONSENT_VERSION) return decideConsent(cookie, []);

  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/server');
    const { data, error } = await getSupabaseAdmin()
      .from('consent_records')
      .select('consent_type, version')
      .eq('user_id', userId)
      .in('consent_type', ['analytics', 'error_monitoring'])
      .is('withdrawn_at', null);
    if (error) return decideConsent(cookie, 'error');

    const records: ActiveConsentRecord[] = (data ?? []).map((row) => ({
      type: row.consent_type as ConsentCategory,
      version: row.version,
    }));
    return decideConsent(cookie, records);
  } catch {
    return decideConsent(cookie, 'error');
  }
}
