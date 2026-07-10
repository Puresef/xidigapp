/**
 * Lane taxonomy for profiles (§20 "pick your lanes" + §26 approved seed
 * tags). Slugs are stable identifiers shared with the tags table seed; they
 * render as-is (taxonomy tokens, not translated copy) so directory lane
 * filtering matches exactly across locales.
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
] as const;

export type Lane = (typeof LANES)[number];
