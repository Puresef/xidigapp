import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ApiError } from '@/lib/api';
import { PINNED_LABS_MAX } from '@/lib/labs/constants';
import { logLabEvent } from '@/lib/labs/service';
import type { LabRow } from '@/lib/labs/views';
import { insertNotification } from '@/lib/notifications/notify';

/**
 * Membership, pins, inter-Lab collaboration and skill-need operations. All
 * writes go through the service-role `admin` client after the route's authz
 * check; each logs a Space History event and, where relevant, an in-app
 * notification (lab activity is in-app only, §26).
 */

type Admin = SupabaseClient<Database>;

// --- membership -------------------------------------------------------------

export type JoinResult = { status: 'active' | 'requested' };

/** Join per the Space's join_mode: open→active, request→queued, invite→closed. */
export async function joinLab(admin: Admin, lab: LabRow, userId: string): Promise<JoinResult> {
  const { data: existing } = await admin
    .from('lab_members')
    .select('status')
    .eq('lab_id', lab.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'active') throw new ApiError('lab_already_member', 409);
    if (existing.status === 'requested') return { status: 'requested' };
    // An outstanding invite, or a previously declined/left member re-joining.
    if (existing.status === 'invited' || lab.join_mode === 'open') {
      await admin
        .from('lab_members')
        .update({ status: 'active', joined_at: new Date().toISOString() })
        .eq('lab_id', lab.id)
        .eq('user_id', userId);
      await logLabEvent(admin, lab.id, userId, 'member_joined', {});
      await insertNotification(admin, {
        userId: lab.lead_user_id,
        actorUserId: userId,
        type: 'lab_join_response',
        entityType: 'lab',
        entityId: lab.id,
      });
      return { status: 'active' };
    }
  }

  if (lab.join_mode === 'invite') throw new ApiError('lab_join_closed', 409);

  const status = lab.join_mode === 'open' ? 'active' : 'requested';
  const { error } = await admin.from('lab_members').insert({
    lab_id: lab.id,
    user_id: userId,
    role: 'member',
    status,
    requested_at: new Date().toISOString(),
    joined_at: status === 'active' ? new Date().toISOString() : null,
  });
  if (error) throw new Error(`join failed: ${error.message}`);

  await logLabEvent(admin, lab.id, userId, status === 'active' ? 'member_joined' : 'join_requested', {});
  await insertNotification(admin, {
    userId: lab.lead_user_id,
    actorUserId: userId,
    type: status === 'active' ? 'lab_join_response' : 'lab_join_request',
    entityType: 'lab',
    entityId: lab.id,
  });
  return { status };
}

/** Caller leaves the Space (the lead cannot leave — they must transfer first). */
export async function leaveLab(admin: Admin, lab: LabRow, userId: string): Promise<void> {
  if (lab.lead_user_id === userId) throw new ApiError('forbidden', 403);
  const { error } = await admin
    .from('lab_members')
    .update({ status: 'left' })
    .eq('lab_id', lab.id)
    .eq('user_id', userId);
  if (error) throw new Error(`leave failed: ${error.message}`);
  await logLabEvent(admin, lab.id, userId, 'member_left', {});
}

/** Lead/admin accepts or declines a pending join request. */
export async function respondToRequest(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  targetUserId: string,
  decision: 'accept' | 'decline',
): Promise<void> {
  const status = decision === 'accept' ? 'active' : 'declined';
  const { data, error } = await admin
    .from('lab_members')
    .update({ status, joined_at: decision === 'accept' ? new Date().toISOString() : null })
    .eq('lab_id', lab.id)
    .eq('user_id', targetUserId)
    .eq('status', 'requested')
    .select('user_id')
    .maybeSingle();
  if (error) throw new Error(`request response failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);

  await logLabEvent(admin, lab.id, actorUserId, decision === 'accept' ? 'member_joined' : 'request_declined', {
    user_id: targetUserId,
  });
  await insertNotification(admin, {
    userId: targetUserId,
    actorUserId,
    type: 'lab_join_response',
    entityType: 'lab',
    entityId: lab.id,
    payload: { decision },
  });
}

/** Lead/admin invites a member (status 'invited' until they join). */
export async function inviteMember(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  targetUserId: string,
  role: 'core' | 'member' | 'observer',
): Promise<void> {
  const { error } = await admin
    .from('lab_members')
    .upsert(
      { lab_id: lab.id, user_id: targetUserId, role, status: 'invited', invited_by_user_id: actorUserId },
      { onConflict: 'lab_id,user_id' },
    );
  if (error) throw new Error(`invite failed: ${error.message}`);
  await logLabEvent(admin, lab.id, actorUserId, 'member_invited', { user_id: targetUserId, role });
  await insertNotification(admin, {
    userId: targetUserId,
    actorUserId,
    type: 'lab_join_request',
    entityType: 'lab',
    entityId: lab.id,
    payload: { invited: true },
  });
}

/** Lead/admin changes a member's role (never to/from 'lead'). */
export async function setMemberRole(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  targetUserId: string,
  role: 'core' | 'member' | 'observer',
): Promise<void> {
  if (targetUserId === lab.lead_user_id) throw new ApiError('forbidden', 403);
  const { data, error } = await admin
    .from('lab_members')
    .update({ role })
    .eq('lab_id', lab.id)
    .eq('user_id', targetUserId)
    .eq('status', 'active')
    .select('user_id')
    .maybeSingle();
  if (error) throw new Error(`role change failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  await logLabEvent(admin, lab.id, actorUserId, 'member_role_changed', { user_id: targetUserId, role });
}

/** Lead/admin removes a member (the lead cannot be removed). */
export async function removeMember(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  if (targetUserId === lab.lead_user_id) throw new ApiError('forbidden', 403);
  const { error } = await admin
    .from('lab_members')
    .update({ status: 'removed' })
    .eq('lab_id', lab.id)
    .eq('user_id', targetUserId);
  if (error) throw new Error(`remove failed: ${error.message}`);
  await logLabEvent(admin, lab.id, actorUserId, 'member_removed', { user_id: targetUserId });
}

// --- pinned Labs (§20) ------------------------------------------------------

export async function pinLab(admin: Admin, userId: string, labId: string): Promise<void> {
  const { data: pins, error } = await admin
    .from('profile_pinned_labs')
    .select('lab_id, position')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw new Error(`pin lookup failed: ${error.message}`);
  if ((pins ?? []).some((p) => p.lab_id === labId)) return; // idempotent
  if ((pins ?? []).length >= PINNED_LABS_MAX) throw new ApiError('pinned_full', 409);

  const used = new Set((pins ?? []).map((p) => p.position));
  let position = 1;
  while (used.has(position)) position += 1;

  const { error: insertError } = await admin
    .from('profile_pinned_labs')
    .insert({ user_id: userId, lab_id: labId, position });
  if (insertError) throw new Error(`pin failed: ${insertError.message}`);
}

export async function unpinLab(admin: Admin, userId: string, labId: string): Promise<void> {
  const { error } = await admin
    .from('profile_pinned_labs')
    .delete()
    .eq('user_id', userId)
    .eq('lab_id', labId);
  if (error) throw new Error(`unpin failed: ${error.message}`);
}

// --- inter-Lab collaboration (§16) ------------------------------------------

export async function proposeCollaboration(
  admin: Admin,
  sourceLab: LabRow,
  targetLabId: string,
  actorUserId: string,
): Promise<{ id: string }> {
  if (targetLabId === sourceLab.id) throw new ApiError('lab_collab_invalid', 409);

  const { data: target, error: targetError } = await admin
    .from('labs')
    .select('id, lead_user_id')
    .eq('id', targetLabId)
    .maybeSingle();
  if (targetError) throw new Error(`target lab lookup failed: ${targetError.message}`);
  if (!target) throw new ApiError('not_found', 404);

  const { data, error } = await admin
    .from('lab_collaborations')
    .insert({
      lab_a_id: sourceLab.id,
      lab_b_id: targetLabId,
      status: 'proposed',
      proposed_by_user_id: actorUserId,
    })
    .select('id')
    .single();
  if (error || !data) {
    if (error?.code === '23505') throw new ApiError('lab_collab_invalid', 409); // already linked/proposed
    throw new Error(`collaboration propose failed: ${error?.message ?? 'no row'}`);
  }

  await logLabEvent(admin, sourceLab.id, actorUserId, 'collab_proposed', { target_lab_id: targetLabId });
  await insertNotification(admin, {
    userId: target.lead_user_id,
    actorUserId,
    type: 'lab_collab_invite',
    entityType: 'lab',
    entityId: sourceLab.id,
    payload: { collaboration_id: data.id },
  });
  return { id: data.id };
}

export async function respondToCollaboration(
  admin: Admin,
  collaborationId: string,
  respondingLabLeadIds: string[],
  actorUserId: string,
  decision: 'accept' | 'decline',
): Promise<void> {
  const { data: collab, error } = await admin
    .from('lab_collaborations')
    .select('id, lab_a_id, lab_b_id, status, proposed_by_user_id')
    .eq('id', collaborationId)
    .maybeSingle();
  if (error) throw new Error(`collaboration lookup failed: ${error.message}`);
  if (!collab || collab.status !== 'proposed') throw new ApiError('lab_collab_invalid', 409);

  // Only a lead/admin of the INVITED (lab_b) side may respond.
  if (!respondingLabLeadIds.includes(collab.lab_b_id)) throw new ApiError('forbidden', 403);

  const status = decision === 'accept' ? 'accepted' : 'declined';
  const { error: updateError } = await admin
    .from('lab_collaborations')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', collaborationId);
  if (updateError) throw new Error(`collaboration response failed: ${updateError.message}`);

  await logLabEvent(admin, collab.lab_a_id, actorUserId, `collab_${status}`, { collaboration_id: collaborationId });
  await logLabEvent(admin, collab.lab_b_id, actorUserId, `collab_${status}`, { collaboration_id: collaborationId });
  if (collab.proposed_by_user_id) {
    await insertNotification(admin, {
      userId: collab.proposed_by_user_id,
      actorUserId,
      type: 'lab_collab_response',
      entityType: 'lab',
      entityId: collab.lab_a_id,
      payload: { decision },
    });
  }
}

export async function endCollaboration(
  admin: Admin,
  collaborationId: string,
  memberLabIds: string[],
  actorUserId: string,
): Promise<void> {
  const { data: collab, error } = await admin
    .from('lab_collaborations')
    .select('id, lab_a_id, lab_b_id, status')
    .eq('id', collaborationId)
    .maybeSingle();
  if (error) throw new Error(`collaboration lookup failed: ${error.message}`);
  if (!collab || collab.status !== 'accepted') throw new ApiError('lab_collab_invalid', 409);
  if (!memberLabIds.includes(collab.lab_a_id) && !memberLabIds.includes(collab.lab_b_id)) {
    throw new ApiError('forbidden', 403);
  }
  const { error: updateError } = await admin
    .from('lab_collaborations')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', collaborationId);
  if (updateError) throw new Error(`collaboration end failed: ${updateError.message}`);
  await logLabEvent(admin, collab.lab_a_id, actorUserId, 'collab_ended', { collaboration_id: collaborationId });
  await logLabEvent(admin, collab.lab_b_id, actorUserId, 'collab_ended', { collaboration_id: collaborationId });
}

// --- skill needs ("looking for") --------------------------------------------

export async function addSkillNeed(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  skill: string,
): Promise<void> {
  const { error } = await admin.from('lab_skill_needs').insert({ lab_id: lab.id, skill });
  if (error) {
    if (error.code === '23505') return; // already an open need for this skill
    throw new Error(`skill need insert failed: ${error.message}`);
  }
  await logLabEvent(admin, lab.id, actorUserId, 'skill_need_added', { skill });
}

export async function removeSkillNeed(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  skillNeedId: string,
): Promise<void> {
  const { error } = await admin
    .from('lab_skill_needs')
    .delete()
    .eq('id', skillNeedId)
    .eq('lab_id', lab.id);
  if (error) throw new Error(`skill need delete failed: ${error.message}`);
  await logLabEvent(admin, lab.id, actorUserId, 'skill_need_removed', { skill_need_id: skillNeedId });
}
