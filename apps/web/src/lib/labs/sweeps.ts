import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { insertNotification } from '@/lib/notifications/notify';

/**
 * Time-based Labs sweeps (§16/§20), invoked by /api/cron/labs. The state
 * changes live in SQL (mark_dormant_labs / flag_skill_gaps — SECURITY DEFINER,
 * service-role only); these helpers do the in-app notification fan-out.
 *
 * Both are ENCOURAGEMENT / assistive, never punitive: dormancy marks + nudges
 * but NEVER demotes (the SQL function touches only dormant_since + a history
 * event), and the skills-gap alert is informational and non-blocking.
 *
 * NOTE (Alpha Hardening Debt): mark_dormant_labs() / flag_skill_gaps() ship in
 * migration 20260706200000 but are not yet in the generated Database types
 * (regenerate database.types.ts after `supabase db push`), hence the `as never`
 * on the rpc names below.
 */

type Admin = SupabaseClient<Database>;

/** Max members pinged per stale skill so the sweep can never spam. */
const SKILL_MATCH_CAP = 25;

/**
 * Mark Spaces dormant after 28 days idle and nudge their members to revive.
 * Returns the count newly marked. Never demotes (see module doc).
 */
export async function markDormantAndNudge(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc('mark_dormant_labs' as never);
  if (error) throw new Error(`mark_dormant_labs failed: ${error.message}`);
  const labIds = (data as unknown as string[]) ?? [];

  for (const labId of labIds) {
    const { data: members } = await admin
      .from('lab_members')
      .select('user_id')
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
  }
  return labIds.length;
}

/**
 * Flag "looking for" skills open + un-alerted for 7 days and notify members
 * whose profile.skills match. Returns the number of alerts sent. Non-blocking.
 */
export async function alertSkillGaps(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc('flag_skill_gaps' as never);
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
    sent += recipients.length;
  }
  return sent;
}
