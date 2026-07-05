/**
 * Analytics consent gate (§26 "no PII in event payloads" is not enough — the
 * lawful basis for product analytics is **opt-in consent**, Art. 6(1)(a); the
 * Privacy Policy promises PostHog stays off until the member agrees).
 *
 * Default-deny: capture is suppressed unless the user has an *active*
 * `analytics` consent record. Anonymous/pre-auth events have no consent record
 * and are therefore denied. Until the consent-capture UI ships (ToS/cookie
 * task) no `analytics` rows exist, so this returns false for everyone and the
 * whole pipeline stays dark even after the PostHog key is set at go-live.
 *
 * Fail-closed: any lookup error denies tracking (a consent check failing must
 * never be treated as consent given — the opposite of the fetch path, which
 * fails open because a dropped event is harmless).
 *
 * The admin client is imported lazily so this module (and the pure capture
 * primitives that depend on it) stay out of the `next/headers` import graph —
 * it's only loaded on a real, enabled, would-actually-capture path.
 */
export async function hasAnalyticsConsent(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/server');
    const { data, error } = await getSupabaseAdmin()
      .from('consent_records')
      .select('id')
      .eq('user_id', userId)
      .eq('consent_type', 'analytics')
      .is('withdrawn_at', null)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}
