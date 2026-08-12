import type { MessageKey } from '@xidig/i18n';

/**
 * Badge canon (Badge Canon b1–b4, ruling 10). The CLASS decides everything:
 * which glyph prefixes the chip, whether the chip may wear trust orange, and
 * whether the badge is allowed on an inline surface at all.
 *
 * Nothing here matches a slug. `badge_definitions.badge_class` is the data
 * (migration 20260811000000 §6), so a role badge added next year is neutral by
 * default instead of neutral by someone remembering — which is the failure the
 * column exists to close.
 */
export type BadgeClass = 'identity' | 'earned' | 'tenure' | 'role';

export interface AnigaBadge {
  slug: string;
  labelKey: MessageKey;
  badgeClass: BadgeClass;
  /** Garab threshold as a bare number label; every tier renders identically. */
  tier: string | null;
  tooltipKey: MessageKey | null;
}

/**
 * slug → label key. Extends the map profile-view-card has carried since Phase 7
 * with the Garab milestone, which rides ONE definition and takes its threshold
 * from `user_badges.tier`: three definitions would invite three treatments, and
 * ruling 10c wants ×5/×25/×100 indistinguishable.
 */
export const ANIGA_BADGE_LABEL_KEYS: Record<string, MessageKey> = {
  'founding-member': 'profile.badgeFoundingMember',
  'lab-lead': 'profile.badgeLabLead',
  'top-helper': 'profile.badgeTopHelper',
  'early-backer': 'profile.badgeEarlyBacker',
  'mentor-in-residence': 'profile.badgeMentorInResidence',
  'identity-verified': 'profile.badgeIdentityVerified',
  'community-verified': 'profile.badgeCommunityVerified',
  'verified-business': 'profile.badgeVerifiedBusiness',
  'garab-milestone': 'profile.badgeGarabMilestone',
};

/**
 * The chip label is the nowrap-safe short form; the sentence that makes the
 * badge *falsifiable* — what was counted, who attested it, that it cannot be
 * bought — rides the tooltip. Only badges whose criterion the canon spells out
 * get one: an invented criterion would be worse than none.
 */
export const ANIGA_BADGE_TOOLTIP_KEYS: Record<string, MessageKey> = {
  'garab-milestone': 'profile.badgeGarabTooltip',
  'top-helper': 'profile.badgeTopHelperTooltip',
  'founding-member': 'profile.badgeFoundingMemberTooltip',
};

/** Labels that interpolate the tier, so a tier-less row can never render `×{count}`. */
const TIER_LABEL_SLUGS = new Set(['garab-milestone']);

/**
 * Build a renderable badge from a `user_badges` row joined to its definition.
 *
 * Returns null rather than falling back to `badge_definitions.name`: those
 * names are English (vocabulary lives in the display layer, the DB stays
 * English), and a stray English chip on a Somali profile reads as a bug, not a
 * badge. An unmapped slug is a missing key — fix the map, don't leak the row.
 */
export function toAnigaBadge(
  slug: string,
  badgeClass: BadgeClass,
  tier: string | null = null,
): AnigaBadge | null {
  const labelKey = ANIGA_BADGE_LABEL_KEYS[slug];
  if (!labelKey) return null;
  if (TIER_LABEL_SLUGS.has(slug) && !tier) return null;

  return {
    slug,
    labelKey,
    badgeClass,
    tier,
    tooltipKey: ANIGA_BADGE_TOOLTIP_KEYS[slug] ?? null,
  };
}

/**
 * The prefix glyph encodes the class, so the chip is readable before the label
 * is: check = something was verified about who you are, guul star = something
 * you earned, bare = a date or a position.
 */
export function badgePrefix(b: AnigaBadge): 'check' | 'star' | 'none' {
  if (b.badgeClass === 'identity') return 'check';
  if (b.badgeClass === 'earned') return 'star';
  return 'none';
}

/**
 * Orange law (DESIGN.md §2, ruling 10a). Identity, earned and founding tenure
 * are trust moments. A ROLE is a position in the community — celebrating a
 * position turns hierarchy into a prize, so roles stay a plain chip forever.
 */
export function badgeVariant(b: AnigaBadge): 'trust' | 'neutral' {
  return b.badgeClass === 'role' ? 'neutral' : 'trust';
}

/**
 * Inline law (ruling 10b). Contexts ≤20px — feed bylines, Suuq rows — carry the
 * Xaqiiqeysan check and nothing else. Milestones start at profile/detail
 * surfaces, so no feed row can become a trophy shelf.
 */
export function isInlineRenderable(b: AnigaBadge): boolean {
  return b.badgeClass === 'identity';
}
