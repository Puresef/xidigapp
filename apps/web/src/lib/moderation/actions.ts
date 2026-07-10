import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { writeAudit } from '@/lib/audit';
import { insertNotification } from '@/lib/notifications/notify';
import type { NotificationType } from '@/lib/notifications/types';

/**
 * The single sanctioned mod-action executor (§19). Every mod/admin action on
 * reported/flagged content or a user funnels through here so the four §19
 * guarantees always hold together: (1) the content/user state changes,
 * (2) an immutable mod_actions row is written (linked to its report when there
 * is one), (3) the affected member is told in plain language — never who
 * reported them or which rule fired, (4) an immutable audit_logs row is
 * recorded. Reused by the member-report decision route AND appeal restoration,
 * so the reversal of an action is itself an attributable, audited action.
 *
 * Mirrors the proven chain in api/admin/moderation/[id]/route.ts (the AI
 * pre-scan queue) — this generalises it across every reportable surface.
 */

type Admin = SupabaseClient<Database>;
type EntityType = Enums<'entity_type'>;
type ModActionType = Enums<'mod_action_type'>;

export interface ModActionInput {
  actorUserId: string;
  action: ModActionType;
  targetType: EntityType;
  targetId: string;
  /** Free-text mod reason (stored on mod_actions; NEVER shown to the target). */
  reason?: string | null | undefined;
  /** Links the action back to the report that triggered it, when any. */
  reportId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/** Content moderation state the action drives, or null for non-content actions. */
function contentStatusFor(action: ModActionType): 'published' | 'hidden' | 'removed' | null {
  switch (action) {
    case 'remove_content':
    case 'remove_listing':
      return 'removed';
    case 'hide_content':
      return 'hidden';
    case 'restore_content':
    case 'restore_listing':
      return 'published';
    default:
      return null;
  }
}

/**
 * Apply the state change for `action` on the target and return the affected
 * member (content author or the user target) so the caller can notify them.
 * Explicit per-type branches keep the Supabase types honest (dynamic table
 * names lose typing) and mirror the AI-scan route's shape.
 */
async function mutateTarget(admin: Admin, input: ModActionInput): Promise<string | null> {
  const { action, targetType, targetId } = input;
  const status = contentStatusFor(action);

  // --- user-state actions ---------------------------------------------------
  if (action === 'suspend_user') {
    const { error } = await admin
      .from('users')
      .update({
        status: 'suspended',
        suspended_at: new Date().toISOString(),
        suspension_reason: input.reason ?? null,
      })
      .eq('id', targetId);
    if (error) throw new Error(`suspend failed: ${error.message}`);
    return targetId;
  }
  if (action === 'unsuspend_user') {
    const { error } = await admin
      .from('users')
      .update({ status: 'active', suspended_at: null, suspension_reason: null })
      .eq('id', targetId)
      .eq('status', 'suspended'); // never resurrect a deactivated/deleted account
    if (error) throw new Error(`unsuspend failed: ${error.message}`);
    return targetId;
  }
  if (action === 'warn_user') {
    return targetId; // no state change — the notification IS the warning
  }
  if (action === 'dismiss_report' || action === 'verify_user' || action === 'revoke_verification') {
    return null; // handled by their own flows; recorded here for the ledger only
  }

  // --- content actions ------------------------------------------------------
  if (status === null) return null;

  switch (targetType) {
    case 'post': {
      const { data, error } = await admin
        .from('posts')
        .update({ status })
        .eq('id', targetId)
        .select('author_user_id')
        .maybeSingle();
      if (error) throw new Error(`post ${action} failed: ${error.message}`);
      return data?.author_user_id ?? null;
    }
    case 'comment': {
      const { data, error } = await admin
        .from('comments')
        .update({ status })
        .eq('id', targetId)
        .select('author_user_id')
        .maybeSingle();
      if (error) throw new Error(`comment ${action} failed: ${error.message}`);
      return data?.author_user_id ?? null;
    }
    case 'lab_update': {
      const { data, error } = await admin
        .from('lab_updates')
        .update({ status })
        .eq('id', targetId)
        .select('author_user_id')
        .maybeSingle();
      if (error) throw new Error(`lab_update ${action} failed: ${error.message}`);
      return data?.author_user_id ?? null;
    }
    case 'lab_artifact': {
      const { data, error } = await admin
        .from('lab_artifacts')
        .update({ status })
        .eq('id', targetId)
        .select('added_by_user_id')
        .maybeSingle();
      if (error) throw new Error(`lab_artifact ${action} failed: ${error.message}`);
      return data?.added_by_user_id ?? null;
    }
    case 'lab_decision': {
      const { data, error } = await admin
        .from('lab_decisions')
        .update({ status })
        .eq('id', targetId)
        .select('created_by_user_id')
        .maybeSingle();
      if (error) throw new Error(`lab_decision ${action} failed: ${error.message}`);
      return data?.created_by_user_id ?? null;
    }
    case 'listing': {
      const { data, error } = await admin
        .from('business_listings')
        .update({ status })
        .eq('id', targetId)
        .select('owner_user_id')
        .maybeSingle();
      if (error) throw new Error(`listing ${action} failed: ${error.message}`);
      return data?.owner_user_id ?? null;
    }
    case 'event': {
      // Events keep lifecycle (draft/published/cancelled) and moderation
      // state in separate columns — mod actions drive moderation_status only
      // (a removed event is not "cancelled"; restore never resurrects a
      // cancelled event into the calendar).
      const { data, error } = await admin
        .from('events')
        .update({ moderation_status: status })
        .eq('id', targetId)
        .select('host_user_id')
        .maybeSingle();
      if (error) throw new Error(`event ${action} failed: ${error.message}`);
      return data?.host_user_id ?? null;
    }
    case 'message': {
      // §19 anonymise-not-erase: soft-delete via deleted_at; the body is
      // tombstoned in the DM view, never hard-deleted.
      const { data, error } = await admin
        .from('messages')
        .update({ deleted_at: status === 'published' ? null : new Date().toISOString() })
        .eq('id', targetId)
        .select('sender_user_id')
        .maybeSingle();
      if (error) throw new Error(`message ${action} failed: ${error.message}`);
      return data?.sender_user_id ?? null;
    }
    case 'candidate': {
      // Candidates are governed by the §17 state machine, not content_status.
      // The least-invasive moderation that respects the Capital recusal seam is
      // pulling a violating Candidate out of the community view (reviewers_only)
      // — it never touches review status/decided_at or the recusal predicate.
      const { data, error } = await admin
        .from('venture_candidates')
        .update({ visibility: status === 'published' ? 'all_members' : 'reviewers_only' })
        .eq('id', targetId)
        .select('created_by_user_id')
        .maybeSingle();
      if (error) throw new Error(`candidate ${action} failed: ${error.message}`);
      return data?.created_by_user_id ?? null;
    }
    default:
      return null; // user/profile/conversation targets have no content row to flip
  }
}

/**
 * The user a sanction lands on: for a user/profile target it's the target
 * itself; for content it's the author. Used by the report-decision route so a
 * warn/suspend on a reported POST applies to the post's AUTHOR, not the post.
 */
export async function resolveSubjectUser(
  admin: Admin,
  targetType: EntityType,
  targetId: string,
): Promise<string | null> {
  if (targetType === 'user' || targetType === 'profile') return targetId;

  const lookup: Partial<Record<EntityType, { table: string; column: string }>> = {
    post: { table: 'posts', column: 'author_user_id' },
    comment: { table: 'comments', column: 'author_user_id' },
    lab_update: { table: 'lab_updates', column: 'author_user_id' },
    lab_artifact: { table: 'lab_artifacts', column: 'added_by_user_id' },
    lab_decision: { table: 'lab_decisions', column: 'created_by_user_id' },
    listing: { table: 'business_listings', column: 'owner_user_id' },
    message: { table: 'messages', column: 'sender_user_id' },
    candidate: { table: 'venture_candidates', column: 'created_by_user_id' },
    event: { table: 'events', column: 'host_user_id' },
  };
  const entry = lookup[targetType];
  if (!entry) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin.from(entry.table as any) as any)
    .select(entry.column)
    .eq('id', targetId)
    .maybeSingle();
  return (data?.[entry.column] as string | undefined) ?? null;
}

/** The plain-language in-app notice a given action sends its target (§27). */
function notificationTypeFor(action: ModActionType): NotificationType | null {
  switch (action) {
    case 'remove_content':
    case 'hide_content':
    case 'remove_listing':
      return 'moderation_removed';
    case 'warn_user':
      return 'account_warned';
    case 'suspend_user':
      return 'account_suspended';
    case 'unsuspend_user':
      return 'account_unsuspended';
    default:
      return null; // restores / dismissals notify via their own flow, or not at all
  }
}

export interface ModActionResult {
  affectedUserId: string | null;
}

/**
 * Execute a moderation action end-to-end: mutate → record mod_action → notify
 * → audit. All writes are service role (the moderation tables have no client
 * write grant). Audit/notify are best-effort (they log, never throw) so the
 * action itself is the source of truth.
 */
export async function applyModAction(
  admin: Admin,
  input: ModActionInput,
): Promise<ModActionResult> {
  const affectedUserId = await mutateTarget(admin, input);

  const { error: actionError } = await admin.from('mod_actions').insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    report_id: input.reportId ?? null,
    reason: input.reason ?? null,
    metadata: (input.metadata ?? {}) as never,
  });
  if (actionError) throw new Error(`mod action record failed: ${actionError.message}`);

  const notifType = notificationTypeFor(input.action);
  if (notifType && affectedUserId && affectedUserId !== input.actorUserId) {
    await insertNotification(admin, {
      userId: affectedUserId,
      type: notifType,
      entityType: input.targetType,
      entityId: input.targetId,
    });
  }

  await writeAudit(admin, {
    actorUserId: input.actorUserId,
    action: `mod_action.${input.action}`,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: { reportId: input.reportId ?? null, ...(input.metadata ?? {}) },
  });

  return { affectedUserId };
}
