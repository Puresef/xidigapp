import { z } from 'zod';

/**
 * "Suggest a term" for the shared-coordinate taxonomies (lanes, listing
 * categories) — the governed counterpart to instant-create. A member proposes;
 * an admin approves into the target catalog or declines.
 */

export const TERM_SUGGESTION_KINDS = ['lane', 'listing_category'] as const;
export type TermSuggestionKind = (typeof TERM_SUGGESTION_KINDS)[number];

export const suggestionCreateSchema = z.object({
  kind: z.enum(TERM_SUGGESTION_KINDS),
  // Must reduce to a valid taxonomy slug, so an approved term can always land in
  // its catalog (rejects punctuation-only input up front).
  term: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .refine((value) => slugifyTerm(value) !== null, { message: 'unusable term' }),
  note: z.string().trim().max(280).optional(),
});

export const suggestionResolveSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'decline']),
});

/**
 * Slugify a free-text term into the shared taxonomy token shape enforced by
 * lanes_slug_format / the category slugs: lowercase, alnum + single hyphens,
 * no leading/trailing hyphen, 2–50 chars. Returns null if nothing usable
 * survives (e.g. punctuation only).
 */
export function slugifyTerm(term: string): string | null {
  const slug = term
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(slug) ? slug : null;
}
