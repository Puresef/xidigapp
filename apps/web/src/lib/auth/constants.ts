/** Auth flow constants (PRD §26 unless noted). */

/**
 * Minimum password policy (§26): length + breach check, no composition rules
 * (NIST 800-63B). The 72 ceiling is a real constraint, not taste — bcrypt
 * (which Supabase uses) silently truncates beyond 72 bytes.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_BYTES = 72;

/** Signup grants: how long a validated invite/waitlist approval holds a slot open. */
export const SIGNUP_GRANT_TTL_MINUTES = 15;

/** Invite creation quota per member per day (anti-abuse; §26 new-account spirit). */
export const INVITES_PER_DAY = 5;

/** Founding Member badge cap (§20). */
export const FOUNDING_MEMBER_CAP = 500;

/**
 * Consent document versions recorded at signup (§12: ToS + Privacy required
 * before Phase 1 data collection). Bump when the human-authored documents
 * change; a new version means a new consent_records row on next acceptance.
 */
export const TERMS_VERSION = '2026-07-04-draft';
export const PRIVACY_VERSION = '2026-07-04-draft';
