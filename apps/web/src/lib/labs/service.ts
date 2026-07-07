import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, TablesInsert, TablesUpdate } from '@xidig/db';

import { ApiError } from '@/lib/api';
import { isCharterComplete, type LabRow } from '@/lib/labs/views';
import type {
  ArtifactCreateInput,
  DecisionCreateInput,
  LabCreateInput,
  LabSettingsInput,
  UpdateCreateInput,
} from '@/lib/labs/schemas';
import { insertNotification } from '@/lib/notifications/notify';
import type { NotificationType } from '@/lib/notifications/types';

/**
 * Labs / Spaces domain operations. Every write runs through the passed-in
 * service-role `admin` client AFTER the route has done its authz check (§22
 * API-first). Each state change writes a lab_events history row and, where the
 * §26 matrix applies, an in-app notification (lab events are in-app only — no
 * email/push). Mirrors lib/dm/service.ts.
 */

type Admin = SupabaseClient<Database>;

/** Space History (§16): append one auditable timeline entry. */
export async function logLabEvent(
  admin: Admin,
  labId: string,
  actorUserId: string | null,
  eventType: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.from('lab_events').insert({
    lab_id: labId,
    actor_user_id: actorUserId,
    event_type: eventType,
    metadata: metadata as never,
  });
  if (error) console.error('[labs] failed to log event:', error.message);
}

/** Fan an in-app notification out to a Space's active members (except the actor). */
export async function notifyLabMembers(
  admin: Admin,
  labId: string,
  input: {
    type: NotificationType;
    actorUserId: string;
    excludeActor?: boolean;
    payload?: Record<string, unknown>;
    bundleKey?: string;
  },
): Promise<void> {
  const { data, error } = await admin
    .from('lab_members')
    .select('user_id')
    .eq('lab_id', labId)
    .eq('status', 'active');
  if (error) {
    console.error('[labs] member fan-out lookup failed:', error.message);
    return;
  }
  const recipients = (data ?? [])
    .map((r) => r.user_id)
    .filter((id) => (input.excludeActor === false ? true : id !== input.actorUserId));
  await Promise.all(
    recipients.map((userId) =>
      insertNotification(admin, {
        userId,
        actorUserId: input.actorUserId,
        type: input.type,
        entityType: 'lab',
        entityId: labId,
        ...(input.payload ? { payload: input.payload } : {}),
        ...(input.bundleKey ? { bundleKey: input.bundleKey } : {}),
      }),
    ),
  );
}

// --- creation ---------------------------------------------------------------

export async function createLab(
  admin: Admin,
  leadUserId: string,
  input: LabCreateInput,
): Promise<LabRow> {
  const insert: TablesInsert<'labs'> = {
    name: input.name,
    slug: input.slug,
    space_mode: input.mode,
    short_description: input.summary ?? null,
    visibility: input.visibility,
    join_mode: input.joinMode,
    lead_user_id: leadUserId,
  };
  if (input.mode === 'lab') {
    insert.problem_statement = input.problemStatement;
    insert.hypothesis = input.hypothesis;
    insert.success_definition = input.successDefinition;
    insert.sprint_length_weeks = input.sprintLengthWeeks ?? null;
    insert.sprint_deadline = input.sprintDeadline ?? null;
    insert.charter_completed_at = new Date().toISOString();
  }

  const { data: lab, error } = await admin.from('labs').insert(insert).select('*').single();
  if (error || !lab) {
    if (error?.code === '23505') throw new ApiError('lab_slug_taken', 409);
    throw new Error(`lab insert failed: ${error?.message ?? 'no row'}`);
  }

  // The lead is member #1.
  const { error: memberError } = await admin.from('lab_members').insert({
    lab_id: lab.id,
    user_id: leadUserId,
    role: 'lead',
    status: 'active',
    joined_at: new Date().toISOString(),
  });
  if (memberError) throw new Error(`lead membership failed: ${memberError.message}`);

  if (input.skills && input.skills.length > 0) {
    await admin
      .from('lab_skill_needs')
      .insert([...new Set(input.skills)].map((skill) => ({ lab_id: lab.id, skill })));
  }
  if (input.tagIds && input.tagIds.length > 0) {
    await admin
      .from('lab_tags')
      .insert([...new Set(input.tagIds)].map((tagId) => ({ lab_id: lab.id, tag_id: tagId })));
  }

  await logLabEvent(admin, lab.id, leadUserId, 'created', { mode: input.mode });
  return lab as LabRow;
}

// --- settings ---------------------------------------------------------------

export async function updateLabSettings(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  input: LabSettingsInput,
): Promise<LabRow> {
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];
  const map: Record<string, string> = {
    name: 'name',
    summary: 'short_description',
    visibility: 'visibility',
    memberListVisibility: 'member_list_visibility',
    joinMode: 'join_mode',
    isListed: 'is_listed',
    isSupporterOnly: 'is_supporter_only',
    problemStatement: 'problem_statement',
    hypothesis: 'hypothesis',
    successDefinition: 'success_definition',
    sprintLengthWeeks: 'sprint_length_weeks',
    sprintDeadline: 'sprint_deadline',
    stage: 'stage',
  };
  for (const [key, column] of Object.entries(map)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      patch[column] = value;
      changed.push(column);
    }
  }

  // Stamp charter completion the first time all three fields are present.
  const merged = { ...lab, ...patch } as LabRow;
  if (!lab.charter_completed_at && isCharterComplete(merged)) {
    patch.charter_completed_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from('labs')
    .update(patch as TablesUpdate<'labs'>)
    .eq('id', lab.id)
    .select('*')
    .single();
  if (error || !data) throw new Error(`settings update failed: ${error?.message ?? 'no row'}`);

  await logLabEvent(admin, lab.id, actorUserId, 'settings_changed', { fields: changed });
  return data as LabRow;
}

// --- promotion (promote-only ladder) ----------------------------------------

/**
 * Club → Lab. Layers the charter over the existing Space: sets space_mode='lab'
 * and promoted_at, preserving id/slug/members/history/updates/artifacts. Never
 * deletes anything. Requires a complete charter (fills gaps from `patch`).
 */
export async function promoteToLab(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  patch: {
    problemStatement?: string | undefined;
    hypothesis?: string | undefined;
    successDefinition?: string | undefined;
    sprintLengthWeeks?: number | undefined;
  },
): Promise<LabRow> {
  const merged = {
    ...lab,
    problem_statement: patch.problemStatement ?? lab.problem_statement,
    hypothesis: patch.hypothesis ?? lab.hypothesis,
    success_definition: patch.successDefinition ?? lab.success_definition,
  } as LabRow;
  if (!isCharterComplete(merged)) throw new ApiError('charter_incomplete', 409);

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('labs')
    .update({
      space_mode: 'lab',
      promoted_at: now,
      charter_completed_at: lab.charter_completed_at ?? now,
      problem_statement: merged.problem_statement,
      hypothesis: merged.hypothesis,
      success_definition: merged.success_definition,
      sprint_length_weeks: patch.sprintLengthWeeks ?? lab.sprint_length_weeks,
    })
    .eq('id', lab.id)
    .eq('space_mode', 'club') // idempotency guard: only a Club promotes
    .select('*')
    .single();
  if (error || !data) throw new Error(`promotion failed: ${error?.message ?? 'not a club'}`);

  await logLabEvent(admin, lab.id, actorUserId, 'promoted', { from: 'club', to: 'lab' });
  await notifyLabMembers(admin, lab.id, {
    type: 'lab_promoted',
    actorUserId,
    payload: { to: 'lab' },
    bundleKey: `lab_promoted:${lab.id}`,
  });
  return data as LabRow;
}

/**
 * Lab → Venture Candidate. A HANDOFF MARKER only (Phase 4 builds no Capital):
 * inserts a draft venture_candidates row linked to the Space and logs the
 * event. Nothing about the Space changes; no review/vote/interest flow.
 */
export async function promoteToCandidate(
  admin: Admin,
  lab: LabRow,
  actorUserId: string,
  input: { name: string; oneLiner?: string | undefined },
): Promise<{ candidateId: string }> {
  const { data, error } = await admin
    .from('venture_candidates')
    .insert({
      lab_id: lab.id,
      created_by_user_id: actorUserId,
      name: input.name,
      one_liner: input.oneLiner ?? null,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`candidate handoff failed: ${error?.message ?? 'no row'}`);

  await logLabEvent(admin, lab.id, actorUserId, 'candidate_created', {
    candidate_id: data.id,
    name: input.name,
  });
  await notifyLabMembers(admin, lab.id, {
    type: 'lab_promoted',
    actorUserId,
    payload: { to: 'candidate', candidateId: data.id },
    bundleKey: `candidate:${data.id}`,
  });
  return { candidateId: data.id };
}

// --- content: updates / artifacts / decisions -------------------------------

export async function addUpdate(
  admin: Admin,
  lab: LabRow,
  authorUserId: string,
  input: UpdateCreateInput,
): Promise<{ id: string }> {
  let collaborationId: string | null = null;
  let partnerLabId: string | null = null;

  if (input.collaborationId) {
    const { data: collab, error } = await admin
      .from('lab_collaborations')
      .select('id, lab_a_id, lab_b_id, status')
      .eq('id', input.collaborationId)
      .maybeSingle();
    if (error) throw new Error(`collaboration lookup failed: ${error.message}`);
    const involves = collab && (collab.lab_a_id === lab.id || collab.lab_b_id === lab.id);
    if (!collab || collab.status !== 'accepted' || !involves) {
      throw new ApiError('lab_collab_invalid', 409);
    }
    collaborationId = collab.id;
    partnerLabId = collab.lab_a_id === lab.id ? collab.lab_b_id : collab.lab_a_id;
  }

  const { data, error } = await admin
    .from('lab_updates')
    .insert({
      lab_id: lab.id,
      author_user_id: authorUserId,
      title: input.title ?? null,
      body: input.body,
      collaboration_id: collaborationId,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`update insert failed: ${error?.message ?? 'no row'}`);

  await logLabEvent(admin, lab.id, authorUserId, 'update_published', { update_id: data.id });
  await notifyLabMembers(admin, lab.id, {
    type: 'lab_update',
    actorUserId: authorUserId,
    bundleKey: `lab_update:${lab.id}`,
  });

  // Cross-post the mirror into the partner Space (single mirror = no loop).
  if (partnerLabId && collaborationId) {
    const { data: mirror } = await admin
      .from('lab_updates')
      .insert({
        lab_id: partnerLabId,
        author_user_id: authorUserId,
        title: input.title ?? null,
        body: input.body,
        collaboration_id: collaborationId,
      })
      .select('id')
      .single();
    if (mirror) {
      await logLabEvent(admin, partnerLabId, authorUserId, 'update_crossposted', {
        from_lab_id: lab.id,
        update_id: mirror.id,
      });
      await notifyLabMembers(admin, partnerLabId, {
        type: 'lab_update',
        actorUserId: authorUserId,
        bundleKey: `lab_update:${partnerLabId}`,
      });
    }
  }

  return { id: data.id };
}

export async function addArtifact(
  admin: Admin,
  lab: LabRow,
  addedByUserId: string,
  input: ArtifactCreateInput,
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from('lab_artifacts')
    .insert({
      lab_id: lab.id,
      added_by_user_id: addedByUserId,
      title: input.title,
      url: input.url,
      description: input.description ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`artifact insert failed: ${error?.message ?? 'no row'}`);
  await logLabEvent(admin, lab.id, addedByUserId, 'artifact_added', { artifact_id: data.id });
  return { id: data.id };
}

export async function addDecision(
  admin: Admin,
  lab: LabRow,
  createdByUserId: string,
  input: DecisionCreateInput,
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from('lab_decisions')
    .insert({
      lab_id: lab.id,
      created_by_user_id: createdByUserId,
      title: input.title,
      context: input.context ?? null,
      decision: input.decision,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`decision insert failed: ${error?.message ?? 'no row'}`);
  await logLabEvent(admin, lab.id, createdByUserId, 'decision_recorded', { decision_id: data.id });
  return { id: data.id };
}
