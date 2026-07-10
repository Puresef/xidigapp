/**
 * Consent capture model (§12) — pure data layer, no IO.
 *
 * Two consent stores work together:
 *
 *   1. `consent_records` (DB) — the legal record. Grant = active row,
 *      decline = absence, withdrawal = `withdrawn_at` set (see
 *      20260704000000_schema.sql + 20260709210000_consent_capture.sql).
 *   2. The `xidig_consent` cookie — a fast path so the layout doesn't hit the
 *      DB on every render, and the ONLY signal the client bundle may read
 *      (instrumentation-client.ts gates Sentry replay on it). Deliberately
 *      NOT httpOnly for that reason; it carries no secrets, only the
 *      member's own choice, and capture stays server-gated by
 *      lib/analytics/consent.ts regardless of what the cookie claims.
 *
 * Versioning: choices are stamped with CONSENT_VERSION (the consent-copy
 * document version). A cookie or record set at an older version no longer
 * counts as a *current* choice (the banner re-appears), but old grants keep
 * being honored until re-answered — hasAnalyticsConsent() is deliberately
 * unversioned. A future bump that MUST invalidate old consent withdraws the
 * old-version rows in a migration (see docs/consent-capture.md).
 */

/** Bump when the consent copy changes materially — re-prompts every member. */
export const CONSENT_VERSION = '2026-07-09';

/** Client-readable (NOT httpOnly) — instrumentation-client.ts parses it. */
export const CONSENT_COOKIE = 'xidig_consent';

export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** The two optional categories. Essential processing is always-on, never a row. */
export type ConsentCategory = 'analytics' | 'error_monitoring';

export interface ConsentFlags {
  analytics: boolean;
  errorMonitoring: boolean;
}

/** Parsed `xidig_consent` value, e.g. `v=2026-07-09&a=1&e=0`. */
export interface ConsentCookieValue extends ConsentFlags {
  version: string;
}

/** What the shell needs: show the banner? what is currently granted? */
export interface ConsentState extends ConsentFlags {
  needsPrompt: boolean;
}

/** An active (withdrawn_at IS NULL) consent_records row, projected. */
export interface ActiveConsentRecord {
  type: ConsentCategory;
  version: string;
}

/**
 * Tolerant parse of the cookie value. Accepts percent-encoded input (Next's
 * cookie serializer encodes `=`/`&` in values), ignores unknown params, is
 * order-insensitive, and treats anything but an exact `1` as false. Returns
 * null when there is no usable version — junk never throws.
 */
export function parseConsentCookie(raw: string | null | undefined): ConsentCookieValue | null {
  if (!raw) return null;
  let value = raw;
  if (value.includes('%')) {
    try {
      value = decodeURIComponent(value);
    } catch {
      // Malformed escapes: fall through with the raw value — its version
      // won't match CONSENT_VERSION, which is the safe outcome.
    }
  }
  const params = new Map<string, string>();
  for (const part of value.split('&')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    params.set(part.slice(0, idx), part.slice(idx + 1));
  }
  const version = params.get('v');
  if (!version || version.length > 64) return null;
  return {
    version,
    analytics: params.get('a') === '1',
    errorMonitoring: params.get('e') === '1',
  };
}

/** Stable serialization: always `v=<version>&a=<0|1>&e=<0|1>`, in that order. */
export function serializeConsentCookie(value: ConsentCookieValue): string {
  return `v=${value.version}&a=${value.analytics ? 1 : 0}&e=${value.errorMonitoring ? 1 : 0}`;
}

/**
 * The consent decision, pure so it's unit-testable (server.ts supplies IO):
 *
 *   - Cookie at CURRENT version → authoritative, no DB needed. Only our own
 *     POST /api/me/consent sets it, and it always mirrors the rows it wrote.
 *   - `records === 'error'` (lookup failed) → fail closed BOTH ways: no
 *     capture (both false) and no banner (a DB blip must not spam members;
 *     the next healthy render re-evaluates).
 *   - Otherwise records decide: a flag is on iff an active row exists (any
 *     version — old grants stay honored, matching hasAnalyticsConsent), and
 *     the banner shows unless some active row proves a CURRENT-version
 *     choice. A member who declined everything leaves no rows (decline =
 *     absence, by schema design), so on a cookie-less device they are
 *     re-prompted — accepted trade-off, documented in docs/consent-capture.md.
 */
export function decideConsent(
  cookie: ConsentCookieValue | null,
  records: ActiveConsentRecord[] | 'error',
): ConsentState {
  if (cookie && cookie.version === CONSENT_VERSION) {
    return {
      needsPrompt: false,
      analytics: cookie.analytics,
      errorMonitoring: cookie.errorMonitoring,
    };
  }
  if (records === 'error') {
    return { needsPrompt: false, analytics: false, errorMonitoring: false };
  }
  return {
    needsPrompt: !records.some((r) => r.version === CONSENT_VERSION),
    analytics: records.some((r) => r.type === 'analytics'),
    errorMonitoring: records.some((r) => r.type === 'error_monitoring'),
  };
}
