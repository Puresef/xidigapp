/**
 * Lane taxonomy for profiles (§20 "pick your lanes" + §26 approved seed
 * tags). Slugs are stable identifiers shared with the tags table seed; they
 * render as-is (taxonomy tokens, not translated copy) so directory lane
 * filtering matches exactly across locales.
 *
 * The runtime source of truth is now the `lanes` DB lookup table (migration
 * 20260718100000) — the profile picker reads it so ops can add a sector without
 * a deploy. This const mirrors the seed and stays the canonical `Lane` type +
 * the directory filter's option list + a fallback if the fetch returns nothing.
 * Keep it in sync with the migration seed.
 */
export const LANES = [
  'fintech',
  'logistics',
  // Canonical dash form: shared with the tags seed, the listing category, and
  // the playbook venture type — all 'import-export'. The old 'import/export'
  // could never be a tag (tags_name_format forbids '/'), so it silently failed
  // to match across surfaces. Reconciled in Phase 8.
  'import-export',
  'agri-food',
  'e-commerce',
  'real-estate',
  'construction',
  'education',
  'health',
  'media',
  'fashion',
  'travel',
  'energy',
  'halal-finance',
  'diaspora',
  // Grown set (migration 20260718100000): sectors members kept bouncing off —
  // livestock/fishing are core to the Somali economy, remittance to the diaspora.
  'livestock',
  'fishing',
  'manufacturing',
  'hospitality',
  'transport',
  'telecom',
  'professional-services',
  'creative-arts',
  'nonprofit',
  'public-sector',
  'retail',
  'remittance',
] as const;

export type Lane = (typeof LANES)[number];
