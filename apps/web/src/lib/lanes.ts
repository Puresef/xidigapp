/**
 * Lane taxonomy for profiles (§20 "pick your lanes" + §26 approved seed
 * tags). Slugs are stable identifiers shared with the tags table seed; they
 * render as-is (taxonomy tokens, not translated copy) so directory lane
 * filtering matches exactly across locales.
 */
export const LANES = [
  'fintech',
  'logistics',
  'import/export',
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
