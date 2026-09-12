import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { VENTURE_TIMEOUT_DAYS } from '@/lib/maal/constants';
import { insertNotification } from '@/lib/notifications/notify';

/**
 * Time-based Labs sweeps (§16/§20), invoked by /api/cron/labs. The state
 * changes live in SQL (mark_dormant_labs / flag_skill_gaps — SECURITY DEFINER,
 * service-role only); these helpers do the in-app notification fan-out.
 *
 * The dormancy sweep is ENCOURAGEMENT, never punitive: mark_dormant_labs()
 * touches only dormant_since + a history event, and it is NOT a stage change.
 * It is the owner check-in that continues. The skills-gap alert is
 * informational and non-blocking.
 *
 * The Maal → Warshad stage timeout (ruling 2) is PAUSED (owner ruling, 12 Sep).
 * Re-promotion to Venture is paused while eligibility is under review, so an
 * automatic demotion would be one-way — unfair, and a change to project state
 * while the ladder itself is under review. The sweep therefore calls neither
 * `warn_timed_out_ventures()` nor `demote_timed_out_ventures()`: no warning
 * stamp, no warning notice promising a return to Lab, no stage change, no
 * Governance Log entry. Both RPCs stay in the schema, service-role only and
 * uncalled; existing `demotion_warned_at` / `demoted_at` values and every past
 * demotion's history are preserved as they are.
 *
 * What replaces the mutation is a read-only operator count — Ventures idle past
 * VENTURE_TIMEOUT_DAYS — returned in the cron response for private review. It
 * writes nothing, stamps nothing and notifies no one.
 *
 * Before any un-pause: a venture warned BEFORE the pause still carries its old
 * `demotion_warned_at`, and the demote RPC's grace check would treat that as
 * notice already given. Re-warn from a clean stamp first; never resume the
 * demote pass straight onto a stale warning.
 */

type Admin = SupabaseClient<Database>;

/** Max members pinged per stale skill so the sweep can never spam. */
const SKILL_MATCH_CAP = 25;

/**
 * Mark Spaces dormant after 28 days idle and nudge their members to revive.
 * Returns the count newly marked. Not the demotion path (see module doc).
 */
export async function markDormantAndNudge(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc('mark_dormant_labs');
  if (error) throw new Error(`mark_dormant_labs failed: ${error.message}`);
  const labIds = (data as unknown as string[]) ?? [];

  for (const labId of labIds) {
    const { data: members } = await admin
      .from('lab_members')
      .select('user_id, role')
      .eq('lab_id', labId)
      .eq('status', 'active');
    await Promise.all(
      (members ?? []).map((m) =>
        insertNotification(admin, {
          userId: m.user_id,
          type: 'lab_dormant',
          entityType: 'lab',
          entityId: labId,
          bundleKey: `lab_dormant:${labId}`,
        }),
      ),
    );
    // §23 lab_marked_dormant: one event per Lab, attributed to its lead (the
    // consent-bearing subject). Fire-and-forget; consent-gated like all capture.
    const lead = (members ?? []).find((m) => m.role === 'lead')?.user_id;
    if (lead) {
      emitServer(event('lab_marked_dormant', {}), { distinctId: lead, userId: lead });
    }
  }
  return labIds.length;
}

const DAY_MS = 86_400_000;

/**
 * The private review marker that replaces the paused demotion: how many
 * Ventures have been idle past VENTURE_TIMEOUT_DAYS. A count for operators, in
 * the cron response only — READ-ONLY by construction (a head-only select): it
 * stamps no column, changes no stage, writes no log and sends no notification.
 */
export async function countVenturesPastTimeout(
  admin: Admin,
  now: number = Date.now(),
): Promise<number> {
  const cutoff = new Date(now - VENTURE_TIMEOUT_DAYS * DAY_MS).toISOString();
  const { count, error } = await admin
    .from('labs')
    .select('id', { count: 'exact', head: true })
    .eq('space_mode', 'venture')
    .lt('last_activity_at', cutoff);
  if (error) throw new Error(`venture timeout count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Flag "looking for" skills open + un-alerted for 7 days and notify members
 * whose profile.skills match. Returns the number of alerts sent. Non-blocking.
 */
export async function alertSkillGaps(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc('flag_skill_gaps');
  if (error) throw new Error(`flag_skill_gaps failed: ${error.message}`);
  const gaps = (data as unknown as { lab_id: string; skill: string }[]) ?? [];

  let sent = 0;
  for (const gap of gaps) {
    // Members already in the Space know — skip them.
    const { data: members } = await admin
      .from('lab_members')
      .select('user_id')
      .eq('lab_id', gap.lab_id)
      .eq('status', 'active');
    const memberIds = new Set((members ?? []).map((m) => m.user_id));

    const { data: matches } = await admin
      .from('profiles')
      .select('user_id')
      .contains('skills', [gap.skill])
      .limit(SKILL_MATCH_CAP);

    const recipients = (matches ?? []).map((p) => p.user_id).filter((id) => !memberIds.has(id));
    await Promise.all(
      recipients.map((userId) =>
        insertNotification(admin, {
          userId,
          type: 'lab_skill_gap',
          entityType: 'lab',
          entityId: gap.lab_id,
          payload: { skill: gap.skill },
          bundleKey: `lab_skill_gap:${gap.lab_id}:${gap.skill}`,
        }),
      ),
    );
    // §23 skills_gap_alert_sent: one per notified member (the consent subject).
    // Skill is a taxonomy slug (PII-free). Fire-and-forget, consent-gated.
    for (const userId of recipients) {
      emitServer(event('skills_gap_alert_sent', { skill: gap.skill }), {
        distinctId: userId,
        userId,
      });
    }
    sent += recipients.length;
  }
  return sent;
}
