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
  /** `user_badges.tier`, passed through. No displayed badge interpolates a
   *  tier today — the only tiered label (the Garab milestone) is retired. */
  tier: string | null;
  tooltipKey: MessageKey | null;
}

/** slug → label key (the map profile-view-card has carried since Phase 7). */
export const ANIGA_BADGE_LABEL_KEYS: Record<string, MessageKey> = {
  'founding-member': 'profile.badgeFoundingMember',
  'lab-lead': 'profile.badgeLabLead',
  'top-helper': 'profile.badgeTopHelper',
  'early-backer': 'profile.badgeEarlyBacker',
  'mentor-in-residence': 'profile.badgeMentorInResidence',
  'identity-verified': 'profile.badgeIdentityVerified',
  'community-verified': 'profile.badgeCommunityVerified',
  'verified-business': 'profile.badgeVerifiedBusiness',
};

/**
 * Badges whose definition row stays in the database but which the profile
 * must never display. slug → why. A retired slug renders nothing even if a
 * `user_badges` row appears — the DB row and any history are untouched.
 */
export const RETIRED_BADGE_SLUGS: Record<string, string> = {
  // Packet B follow-up (PRD Relook §24 / D-10): named "Garab" (the support
  // signal) but defined as "verified thanks from askers" — resolved-Ask helper
  // credit. Neither reading is honest on a profile: support never verifies
  // anything, and helper credit already has its own badge (Top Helper). No
  // production path ever granted it (0 holders on Dev), so it is retired
  // rather than renamed into a new badge system.
  'garab-milestone': 'mixed support/verified-helper-credit meaning; never granted',
};

/**
 * The chip label is the nowrap-safe short form; the sentence that makes the
 * badge *falsifiable* — what was counted, who attested it, that it cannot be
 * bought — rides the tooltip. Only badges whose criterion the canon spells out
 * get one: an invented criterion would be worse than none.
 */
export const ANIGA_BADGE_TOOLTIP_KEYS: Record<string, MessageKey> = {
  'top-helper': 'profile.badgeTopHelperTooltip',
  'founding-member': 'profile.badgeFoundingMemberTooltip',
};

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
  if (slug in RETIRED_BADGE_SLUGS) return null;
  const labelKey = ANIGA_BADGE_LABEL_KEYS[slug];
  if (!labelKey) return null;

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
