import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { REPUTATION_POINTS, REPUTATION_SCORE_CLASS, type ReputationEventType } from './constants';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@xidig/db';

/**
 * Reputation + badge service (PRD §14 / §20 / §23).
 *
 * The single app-side seam over the Phase-7 DB engine. Every credit goes
 * through award_reputation() and every milestone badge through award_badge()
 * (both SECURITY DEFINER, service-role-only) so the §14 anti-gaming rules — 30
 * pt/day/class cap, no self-interaction, no AI-account Helper score, idempotent
 * per-entity credit — are enforced in ONE place a call site cannot bypass.
 * Badge awards additionally emit the §23 badge_awarded event exactly once.
 *
 * Both calls are best-effort: reputation/badges are a reward layer, so a hiccup
 * is logged but never breaks the user action that earned it.
 */

type Admin = SupabaseClient<Database>;

/**
 * Credit reputation for an event. Returns the points ACTUALLY awarded
 * (post-cap; 0 when capped, duplicate, or an AI account earning Helper score).
 * Call AFTER the source write commits, passing the entity so credit is
 * idempotent. `userId` must be the EARNER — never award self-interaction
 * points (the caller decides who earns; e.g. Ask-credit pays the helper, not
 * the asker, and refuses helper == asker upstream).
 */
export async function awardReputation(
  admin: Admin,
  input: {
    userId: string;
    eventType: ReputationEventType;
    entityType: Enums<'entity_type'>;
    entityId: string;
  },
): Promise<number> {
  const { data, error } = await admin.rpc('award_reputation', {
    p_user_id: input.userId,
    p_event_type: input.eventType,
    p_score_class: REPUTATION_SCORE_CLASS[input.eventType],
    p_points: REPUTATION_POINTS[input.eventType],
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error) {
    console.error('[reputation] award_reputation failed:', error.message);
    return 0;
  }
  return data ?? 0;
}

/**
 * Award a milestone badge idempotently. Returns TRUE only when a NEW badge was
 * granted — and emits badge_awarded (§23) exactly once in that case. A retry
 * (badge already held) is a silent no-op. `context` disambiguates repeatable
 * awards (e.g. a quarter/period for rotating badges).
 */
export async function awardBadge(
  admin: Admin,
  input: { userId: string; slug: string; context?: string | null },
): Promise<boolean> {
  const { data, error } = await admin.rpc('award_badge', {
    p_user_id: input.userId,
    p_slug: input.slug,
    ...(input.context != null ? { p_context: input.context } : {}),
  });
  if (error) {
    console.error('[reputation] award_badge failed:', error.message);
    return false;
  }
  if (data === true) {
    // Governed by the recipient's analytics consent (they are the subject).
    emitServer(event('badge_awarded', { badge: input.slug }), {
      distinctId: input.userId,
      userId: input.userId,
    });
    return true;
  }
  return false;
}

/** Current helper score, for badge-threshold checks after a helper credit. */
export async function getHelperScore(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('reputation_scores')
    .select('helper_score')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.helper_score ?? 0;
}
