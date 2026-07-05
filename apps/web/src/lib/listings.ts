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

/** Fields an owner (or mod) may edit — same columns, all optional, none defaulted. */
export const listingUpdateSchema = z
  .object(listingCore)
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
