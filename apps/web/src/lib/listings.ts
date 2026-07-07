import { z } from 'zod';

/**
 * Business-listing shapes shared by the directory/map routes (§18).
 *
 * Manual pin-drop is the primary location input — Somali addressing defeats
 * geocoders (§18), so latitude/longitude come straight from the map pin and
 * address/landmark are free text. Moderated/derived columns
 * (status, verification_status, source, export_readiness_score) are never in
 * these schemas — RLS column grants forbid them client-side anyway.
 */

/** §26 anti-spam quota: new accounts may create 2 listings per week. */
export const LISTINGS_PER_WEEK = 2;

/** Phase 4.5 caps (API-layer rules — the tables themselves don't enforce them). */
export const LISTING_MAX_PHOTOS = 5;
export const LISTING_MAX_SERVICES = 20;

/* ----------------------------------------------------------------------------
 * Opening hours (Phase 4.5, spec §1c). jsonb shape:
 *   { "mon": [{"open":"09:00","close":"17:00"}], ..., "sun": [] }
 * null = not provided; an empty array = closed that day. Times are local to
 * the business (v1 stores no timezone — "Open now" is computed from the
 * VIEWER's clock, which is right for the local-city browsing case and only
 * approximate for diaspora viewers; a timezone column is a future refinement).
 * ------------------------------------------------------------------------- */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type DayKey = (typeof DAY_KEYS)[number];

export interface HoursInterval {
  /** "HH:MM", 24h. */
  open: string;
  close: string;
}

export type OpeningHours = Record<DayKey, HoursInterval[]>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const hoursIntervalSchema = z.object({
  open: z.string().regex(TIME_PATTERN),
  close: z.string().regex(TIME_PATTERN),
});

const dayIntervalsSchema = z.array(hoursIntervalSchema).max(3);

export const openingHoursSchema = z.object({
  mon: dayIntervalsSchema,
  tue: dayIntervalsSchema,
  wed: dayIntervalsSchema,
  thu: dayIntervalsSchema,
  fri: dayIntervalsSchema,
  sat: dayIntervalsSchema,
  sun: dayIntervalsSchema,
});

/** Parse an untrusted jsonb column value; malformed/absent → null. */
export function asOpeningHours(value: unknown): OpeningHours | null {
  const parsed = openingHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** True when every day is empty — the editor's "never touched" shape. */
export function isEmptyOpeningHours(hours: OpeningHours): boolean {
  return DAY_KEYS.every((day) => hours[day].length === 0);
}

/** getDay() (0 = Sunday) → jsonb day key. */
const JS_DAY_TO_KEY: readonly DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * "Open now" from a wall-clock instant (v1 display-only, §18). Handles
 * overnight intervals (close < open spans midnight — the interval opens today
 * and also spills into tomorrow morning). open === close is treated as closed
 * (a zero-length interval), not 24h.
 *
 * TIMEZONE CAVEAT: `now` is the VIEWER's clock; stored times are the
 * business's local time. Correct when both are in the same city — the primary
 * Suuq browsing case — and approximate otherwise.
 */
export function isOpenNow(hours: OpeningHours, now: Date = new Date()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (time: string): number => {
    const [h = 0, m = 0] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const today = JS_DAY_TO_KEY[now.getDay()] as DayKey;
  const yesterday = JS_DAY_TO_KEY[(now.getDay() + 6) % 7] as DayKey;

  for (const interval of hours[today]) {
    const open = toMinutes(interval.open);
    const close = toMinutes(interval.close);
    if (open === close) continue;
    if (open < close ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  // Yesterday's overnight tail (e.g. Fri 20:00–02:00 keeps Sat 01:00 open).
  for (const interval of hours[yesterday]) {
    const open = toMinutes(interval.open);
    const close = toMinutes(interval.close);
    if (close < open && minutes < close) return true;
  }
  return false;
}

/** Convenience for card/directory surfaces holding the raw jsonb value. */
export function listingOpenNow(value: unknown, now: Date = new Date()): boolean {
  const hours = asOpeningHours(value);
  return hours !== null && isOpenNow(hours, now);
}

/** Price range 1–4 → "$".."$$$$" (render with an aria-label for meaning). */
export function formatPriceRange(level: number): string {
  return '$'.repeat(Math.min(Math.max(Math.trunc(level), 1), 4));
}

/* ----------------------------------------------------------------------------
 * Contact links — pure helpers shared by client components (contact list,
 * WhatsApp CTA) and server surfaces (edit page initial values). Channel
 * names are taxonomy tokens (whatsapp/phone/email/...), rendered as-is.
 * ------------------------------------------------------------------------- */

export interface ContactLink {
  type: string;
  label?: string;
  value: string;
}

/** Parse the untrusted contact_links jsonb column. */
export function asContactLinks(value: unknown): ContactLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is ContactLink =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as ContactLink).type === 'string' &&
      typeof (row as ContactLink).value === 'string',
  );
}

/** Tappable href for a contact row, or null when the value can't make one. */
export function contactHref(type: string, value: string): string | null {
  if (type === 'whatsapp') {
    const digits = value.replace(/[^0-9]/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }
  if (type === 'phone') {
    const tel = value.replace(/[^0-9+]/g, '');
    return tel ? `tel:${tel}` : null;
  }
  if (type === 'email') return `mailto:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (type === 'website' || type === 'facebook' || type === 'instagram') {
    return `https://${value}`;
  }
  return null;
}

/** Services/menu rows (≤20, replace-all on PATCH). */
export const listingServiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  priceLabel: z.string().trim().max(40).nullish(),
});

export type ListingServiceInput = z.infer<typeof listingServiceSchema>;

const contactLinkSchema = z.object({
  type: z.string().trim().min(1).max(40),
  label: z.string().trim().max(80).optional(),
  value: z.string().trim().min(1).max(300),
});

const coordinate = {
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
};

/**
 * The editable columns. Kept default-free so the update schema's "partial"
 * derivation stays truly partial — a default would inject a key and let an
 * empty PATCH slip through.
 */
const listingCore = {
  business_name: z.string().trim().min(1).max(160),
  category_id: z.string().uuid(),
  short_description: z.string().trim().max(500).nullish(),
  address: z.string().trim().max(300).nullish(),
  landmark: z.string().trim().max(200).nullish(),
  ...coordinate,
  city: z.string().trim().max(120).nullish(),
  country: z.string().trim().max(120).nullish(),
  contact_links: z.array(contactLinkSchema).max(15),
};

export const listingCreateSchema = z.object({
  ...listingCore,
  contact_links: z.array(contactLinkSchema).max(15).default([]),
  /** Skip the duplicate-detection block after the user reviews the matches. */
  force: z.boolean().default(false),
});

export type ListingCreateInput = z.infer<typeof listingCreateSchema>;

/**
 * Fields an owner (or mod) may edit — same columns, all optional, none
 * defaulted. Phase 4.5 additions use the spec's camelCase wire names
 * (openingHours/priceRange/services); the route maps them onto columns.
 * `services` is NOT a business_listings column — it replace-all rewrites
 * listing_services via the service role.
 */
export const listingUpdateSchema = z
  .object({
    ...listingCore,
    openingHours: openingHoursSchema.nullable(),
    priceRange: z.number().int().min(1).max(4).nullable(),
    services: z.array(listingServiceSchema).max(LISTING_MAX_SERVICES),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

/**
 * Normalise a business name for duplicate detection (§18): lowercase, strip
 * punctuation, collapse whitespace. The real fuzzy/transliteration matching
 * (Maxamed/Mohamed) is Meilisearch's job (§24); this catches the exact/near
 * re-adds before an index exists.
 */
export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
