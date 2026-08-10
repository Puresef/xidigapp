/**
 * Fariimo (DM) policy constants. Request cap is §26 ("new accounts: … 5 DM
 * requests/day"); the rest are sensible flood guards the PRD leaves to the
 * builder.
 */

export const DM_REQUEST_LIMIT_PER_DAY = 5;
export const DM_REQUEST_WINDOW_SECONDS = 86_400;

/** Per-minute burst ceiling on message sends (accepted threads) — flood guard. */
export const MESSAGE_BURST_MAX = 30;
export const MESSAGE_BURST_WINDOW_SECONDS = 60;

export const MESSAGE_MAX_LENGTH = 4000;

/** Messages per history page (keyset). */
export const DM_MESSAGE_PAGE_SIZE = 30;
export const DM_MESSAGE_PAGE_MAX = 50;

/** Conversations per inbox page. */
export const DM_INBOX_PAGE_SIZE = 20;

/** Length of the message preview stored in a notification payload / inbox. */
export const DM_PREVIEW_LENGTH = 140;

// Voice notes (F2 §4): self-recorded only, duration shown, no transcription.
// 3MB ≈ well over 120s of Opus; the duration cap is the real limit.
export const VOICE_MAX_BYTES = 3 * 1024 * 1024;
export const VOICE_MIN_SECONDS = 1;
export const VOICE_MAX_SECONDS = 120;
/** Signed-URL lifetime for DM audio — long enough to buffer, short enough
 * that a leaked URL goes stale before it travels. */
export const VOICE_SIGNED_URL_TTL_SECONDS = 300;

/** Requests auto-delete after 30 idle days (HANDOFF Fariimo row): pending
 * AND declined conversations — sender-side, a declined request is
 * indistinguishable from a pending one, so they must age out together. */
export const DM_REQUEST_TTL_DAYS = 30;
