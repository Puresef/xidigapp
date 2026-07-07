/**
 * Plaza constants (PRD §15, §20, §26 + Build Tracker Seq 14 poll mechanics).
 *
 * Rate limits are per-day fixed windows enforced through lib/rate-limit.ts
 * (Upstash, fail-open). §26 sets the free caps ("new accounts: 5 posts/day,
 * 10 comments/day"); the Supporter caps are deliberately generous — §27's
 * rate-limit copy promises "upgrade for higher limits", and abuse control at
 * that tier is moderation's job, not the limiter's.
 */

export const POST_LIMIT_FREE = 5; // §26/§27
export const POST_LIMIT_SUPPORTER = 25;
export const COMMENT_LIMIT_FREE = 10; // §26
export const COMMENT_LIMIT_SUPPORTER = 50;
export const RATE_WINDOW_DAY_SECONDS = 86_400;

export const POST_TITLE_MAX = 200;
export const POST_BODY_MAX = 5_000;
export const COMMENT_BODY_MAX = 2_000;
export const LINK_URL_MAX = 2_048;
export const TAGS_PER_POST_MAX = 5;
export const TAG_CREATES_PER_DAY = 10;

// Seq 14 (locked): single-select, 2–6 options, 1–7 days (default 3), early
// close allowed, vote change until close, ballots anonymous (counts only).
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 6;
export const POLL_OPTION_LABEL_MAX = 100;
export const POLL_DEFAULT_DAYS = 3;
export const POLL_MIN_DAYS = 1;
export const POLL_MAX_DAYS = 7;

// §15/§26 media: 1–5MB upload, transcoded to WebP (EXIF dropped by re-encode).
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_MB = 5;
export const POST_MAX_IMAGES = 4;
export const IMAGE_MAX_DIMENSION = 2_048;
export const MEDIA_BUCKET = 'post-media';

export const ASK_NUDGE_AFTER_DAYS = 7; // §15/§26 stale-Ask nudge

// §15 helper credit → reputation_events ledger row (event_type below).
// Phase 7 recomputes scores with the full 30pt/day-cap + 90-day-decay rules;
// until then the materialized helper_score is a plain increment.
export const HELPER_CREDIT_POINTS = 10;
export const HELPER_CREDIT_EVENT_TYPE = 'ask_credited';
