/**
 * Phase 6 moderation / verification / account-lifecycle constants (§14/§19/§27).
 * Windows that appear in §27 copy live here (not inline) so the enforced timer
 * and the plain-language promise never drift.
 */

// §27 / §19 SLAs — surfaced as an "age" badge in the queues (created_at based).
export const REPORT_SLA_HOURS = 48; // §27 "within 48 hours"
export const APPEAL_SLA_HOURS = 72; // §27 "within 72 hours"
export const VERIFICATION_SLA_DAYS = 7; // §14 "7-day queue SLA"

// §19 account lifecycle.
export const DELETION_GRACE_DAYS = 30; // §19/§27 "30-day grace"

// §14 sensitive-data retention.
export const RECORDING_RETENTION_MONTHS = 24; // §14 "24-month retention"

// §14 Community Verified: number of vouches from verified members that auto-
// upgrades a profile to community_verified.
export const COMMUNITY_VOUCH_THRESHOLD = 3;

// --- Abuse guards (§19 "edge rate limiting") --------------------------------
// enforceRateLimit windows for the new high-risk Phase 6 endpoints. Fixed
// windows (lib/rate-limit.ts); anti-gaming that must survive a missing cache is
// additionally backed by DB constraints (one-appeal-per-action, one-open-report
// -per-target-per-reporter), so a fail-open limiter never opens the barn door.
export const APPEAL_RATE = { max: 10, windowSeconds: 3600 } as const; // 10/hr
export const VERIFICATION_REQUEST_RATE = { max: 3, windowSeconds: 86_400 } as const; // 3/day
export const ACCOUNT_LIFECYCLE_RATE = { max: 5, windowSeconds: 3600 } as const; // 5/hr
export const MOD_ACTION_RATE = { max: 300, windowSeconds: 3600 } as const; // scripted-mod backstop

// §19 anti-spam: new accounts get tighter caps for their first N days. Enforced
// at the edge in addition to the existing tier limits.
export const NEW_ACCOUNT_DAYS = 3;
export const NEW_ACCOUNT_POST_LIMIT = 3; // per day, first NEW_ACCOUNT_DAYS
export const NEW_ACCOUNT_DM_REQUEST_LIMIT = 5; // per day
