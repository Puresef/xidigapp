import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import {
  VENTURE_TIMEOUT_DAYS,
  VENTURE_WARN_DAYS,
  VENTURE_WARN_GRACE_DAYS,
} from '@/lib/maal/constants';
import { insertNotification } from '@/lib/notifications/notify';

/**
 * Time-based Labs sweeps (§16/§20), invoked by /api/cron/labs. The state
 * changes live in SQL (mark_dormant_labs / flag_skill_gaps /
 * warn_timed_out_ventures / demote_timed_out_ventures — SECURITY DEFINER,
 * service-role only); these helpers do the in-app notification fan-out.
 *
 * The dormancy sweep is ENCOURAGEMENT, never punitive: mark_dormant_labs()
 * touches only dormant_since + a history event, and it is NOT the demotion
 * path. The skills-gap alert is informational and non-blocking.
 *
 * The Maal → Warshad stage timeout (ruling 2) IS a state change, and it is the
 * system's alone: warn at 70 days idle, demote at 84 — never sooner than 7 days
 * after the warning went out. Both passes run here, warn BEFORE demote in the
 * same sweep, so a venture that crosses both thresholds in one pass is still
 * warned first and demoted a week later rather than in the same breath. The
 * demote RPC writes the lab_events row and the PUBLISHED governance_log_entries
 * row itself, inside its own transaction — this module must not duplicate
 * either; what it adds is telling the members.
 *
 * The rpc names ship in migrations 20260706200000 and 20260813000100 and are
 * present in the generated Database types (regenerated offline via
 * `pnpm --filter @xidig/db gen-types:local`), so all four are typed.
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

/** Active members of a Space, with the lead marked — the sweep fan-out unit. */
async function ventureRecipients(
  admin: Admin,
  labId: string,
): Promise<{ userIds: string[]; leadUserId: string | null }> {
  const { data } = await admin
    .from('lab_members')
    .select('user_id, role')
    .eq('lab_id', labId)
    .eq('status', 'active');
  const members = data ?? [];
  return {
    userIds: members.map((m) => m.user_id),
    leadUserId: members.find((m) => m.role === 'lead')?.user_id ?? null,
  };
}

/** Space names for the notification payload (the sweep has no request locale). */
async function ventureNames(admin: Admin, labIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (labIds.length === 0) return names;
  const { data } = await admin.from('labs').select('id, name, slug').in('id', labIds);
  for (const row of data ?? []) names.set(row.id, row.name);
  return names;
}

/**
 * The advance notice (ruling 2). Stamps demotion_warned_at on every Maal idle
 * past VENTURE_WARN_DAYS, then tells its members the three things the index law
 * promises: it will return to Warshad unless something happens, one act of work
 * is enough to stop it, and the change will be written to the public Governance
 * Log.
 *
 * What it does NOT promise is an appeal. `appeals` is scoped to mod_actions
 * (§19) and a system timeout is not a moderation action, so there is no form
 * behind that word — the remedy is re-promotion, which is what the copy offers
 * instead (PRD §16). Nothing here carries `appealable`.
 *
 * Any activity clears demotion_warned_at in the DB trigger, so a venture that
 * revives is never warned twice for the same silence. Returns the count warned.
 */
export async function warnTimedOutVentures(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc('warn_timed_out_ventures', {
    p_warn_after_days: VENTURE_WARN_DAYS,
  });
  if (error) throw new Error(`warn_timed_out_ventures failed: ${error.message}`);
  const labIds = (data as unknown as string[]) ?? [];
  const names = await ventureNames(admin, labIds);

  for (const labId of labIds) {
    const { userIds, leadUserId } = await ventureRecipients(admin, labId);
    await Promise.all(
      userIds.map((userId) =>
        insertNotification(admin, {
          userId,
          type: 'venture_demotion_warning',
          entityType: 'lab',
          entityId: labId,
          payload: {
            name: names.get(labId) ?? '',
            timeoutDays: VENTURE_TIMEOUT_DAYS,
            graceDays: VENTURE_WARN_GRACE_DAYS,
          },
          bundleKey: `venture_demotion_warning:${labId}`,
        }),
      ),
    );
    // §23, attributed to the lead — the consent-bearing subject, the same
    // attribution lab_marked_dormant uses (a sweep has no actor).
    if (leadUserId) {
      emitServer(event('venture_demotion_warned', {}), {
        distinctId: leadUserId,
        userId: leadUserId,
      });
    }
  }
  return labIds.length;
}

/**
 * The stage change itself. The RPC moves space_mode back to 'lab', stamps
 * demoted_at, and writes BOTH the lab_events row and the published Governance
 * Log entry in one transaction — nothing about the venture's work is touched:
 * ledger, tasks, workstreams, members, decisions, promoted_at and venture_since
 * all survive, because only the current stage moved.
 *
 * What this adds is the announcement — and the announcement offers the remedy
 * that exists. Not an appeal: a system timeout is not a mod_action, so §19's
 * appeal path has no row and no form for it. Because every artefact survived,
 * the lead can simply promote the venture again once the work restarts, and the
 * copy says exactly that. Returns the count demoted.
 */
export async function demoteTimedOutVentures(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc('demote_timed_out_ventures', {
    p_timeout_days: VENTURE_TIMEOUT_DAYS,
    p_warned_days: VENTURE_WARN_GRACE_DAYS,
  });
  if (error) throw new Error(`demote_timed_out_ventures failed: ${error.message}`);
  const labIds = (data as unknown as string[]) ?? [];
  const names = await ventureNames(admin, labIds);

  for (const labId of labIds) {
    const { userIds, leadUserId } = await ventureRecipients(admin, labId);
    await Promise.all(
      userIds.map((userId) =>
        insertNotification(admin, {
          userId,
          type: 'venture_demoted',
          entityType: 'lab',
          entityId: labId,
          payload: { name: names.get(labId) ?? '', timeoutDays: VENTURE_TIMEOUT_DAYS },
          bundleKey: `venture_demoted:${labId}`,
        }),
      ),
    );
    if (leadUserId) {
      emitServer(event('venture_demoted', {}), { distinctId: leadUserId, userId: leadUserId });
    }
  }
  return labIds.length;
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
