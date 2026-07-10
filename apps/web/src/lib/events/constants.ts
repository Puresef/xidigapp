/**
 * Events + RSVP constants (extras item 8, design locked 10 Jul).
 * The privacy numbers here are load-bearing locked design, not tuning knobs.
 */

/** Public/member aggregate RSVP counts render only at or above this floor. */
export const RSVP_COUNT_FLOOR = 5;

/** Slug shape (mirrors the DB CHECK events_slug_format). */
export const EVENT_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,79}[a-z0-9])?$/;

export const EVENT_TITLE_MAX = 120;
export const EVENT_DESCRIPTION_MAX = 4000;
export const EVENT_VENUE_NAME_MAX = 160;
export const EVENT_VENUE_ADDRESS_MAX = 300;
export const EVENT_URL_MAX = 500;
export const EVENT_TIMEZONE_MAX = 64;
export const EVENT_CAPACITY_MAX = 100_000;

/** Creation cap per host per day (anti-spam; same tier as other creates). */
export const EVENT_CREATE_LIMIT_PER_DAY = 10;

/** Embedded upcoming-events sections (Lab/listing/profile) are count-limited. */
export const EMBEDDED_EVENTS_LIMIT = 3;

/** Index pages cap (chronological, no pagination needed at alpha volume). */
export const EVENTS_INDEX_LIMIT = 50;
