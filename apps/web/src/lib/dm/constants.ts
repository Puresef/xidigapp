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
