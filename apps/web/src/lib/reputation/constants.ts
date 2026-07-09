/**
 * Reputation weights + milestone rules (PRD §14 / §20).
 *
 * MIRRORS the header of migration 20260709000000_phase7_reputation_awards.sql —
 * keep the two in sync. The DB function award_reputation() is weight-agnostic
 * (points are passed in), so tuning these never needs a migration; the daily
 * cap (30/class) and decay window (90d) ARE enforced in SQL and listed here for
 * reference only.
 */

/** Points per contribution/helper event. */
export const REPUTATION_POINTS = {
  post_created: 5,
  comment_created: 2,
  lab_update_published: 5,
  ask_credited: 10,
} as const;

export type ReputationEventType = keyof typeof REPUTATION_POINTS;

/** Which materialised score each event feeds. */
export const REPUTATION_SCORE_CLASS: Record<ReputationEventType, 'contribution' | 'helper'> = {
  post_created: 'contribution',
  comment_created: 'contribution',
  lab_update_published: 'contribution',
  ask_credited: 'helper',
};

/** Enforced in SQL — documented here for callers/tests. */
export const DAILY_SCORE_CAP = 30;
export const DECAY_WINDOW_DAYS = 90;

/**
 * Helper score at which the Top Helper badge is granted (≈5 credited Asks at 10
 * pts each). Threshold, not a leaderboard rank — idempotent + explainable.
 */
export const TOP_HELPER_THRESHOLD = 50;

/** Milestone badge slugs (all pre-seeded in badge_definitions). */
export const BADGE_SLUGS = {
  founding: 'founding-member',
  labLead: 'lab-lead',
  topHelper: 'top-helper',
  earlyBacker: 'early-backer',
  mentor: 'mentor-in-residence',
} as const;
