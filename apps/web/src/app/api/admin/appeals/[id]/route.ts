import { z } from 'zod';

import type { Enums } from '@xidig/db';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { applyModAction } from '@/lib/moderation/actions';
import { appealDecisionSchema } from '@/lib/moderation/schemas';
import { insertNotification } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Appeal decision by a SECOND mod/admin (§19). RECUSAL is hard: a reviewer may
 * never decide an appeal of an action they took themselves (403
 * appeal_self_review) — the queue hides these, this route enforces it. Only a
 * pending appeal is decidable. 'upheld' leaves the original action standing;
 * 'overturned' reverses it through applyModAction (the SAME audited executor
 * that made the original sanction), so a restore is itself an attributable,
 * immutable mod_action — remove/hide → restore_content, remove_listing →
 * restore_listing, suspend_user → unsuspend_user; a warning has no state to
 * reverse and is recorded only. All writes are service role.
 */

const idSchema = z.string().uuid();

/**
 * The reversing action for an overturned appeal, or null when the original
 * action has no reversible state (warn_user, restores, dismissals). Kept
 * exhaustive so a new mod_action_type surfaces here at review time.
 */
function inverseAction(action: Enums<'mod_action_type'>): Enums<'mod_action_type'> | null {
  switch (action) {
    case 'remove_content':
    case 'hide_content':
      return 'restore_content';
    case 'remove_listing':
      return 'restore_listing';
    case 'suspend_user':
      return 'unsuspend_user';
    default:
      return null; // warn_user / restores / verification actions: nothing to undo
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const reviewer = await requireRole('mod');
    const parsedId = idSchema.safeParse((await context.params).id);
    if (!parsedId.success) throw new ApiError('not_found', 404);

    const input = appealDecisionSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const { data: appeal, error: appealError } = await admin
      .from('appeals')
      .select('id, mod_action_id, appellant_user_id, status')
      .eq('id', parsedId.data)
      .maybeSingle();
    if (appealError) throw new Error(`appeal lookup failed: ${appealError.message}`);
    if (!appeal) throw new ApiError('not_found', 404);

    const { data: modAction, error: modActionError } = await admin
      .from('mod_actions')
      .select('id, action, target_type, target_id, actor_user_id, report_id')
      .eq('id', appeal.mod_action_id)
      .maybeSingle();
    if (modActionError) throw new Error(`mod action lookup failed: ${modActionError.message}`);
    if (!modAction) throw new ApiError('not_found', 404);

    // Recusal: you cannot review an appeal of your own action.
    if (modAction.actor_user_id === reviewer.appUser.id) {
      throw new ApiError('appeal_self_review', 403);
    }
    if (appeal.status !== 'pending') throw new ApiError('invalid_request', 400);

    if (input.outcome === 'overturned') {
      const inverse = inverseAction(modAction.action);
      if (inverse) {
        // Restore through the same audited executor — the reversal is itself an
        // attributable mod_action, notifies the affected member, and audits.
        await applyModAction(admin, {
          actorUserId: reviewer.appUser.id,
          action: inverse,
          targetType: modAction.target_type,
          targetId: modAction.target_id,
          reason: input.decisionNotes ?? null,
          reportId: modAction.report_id,
        });
      }
    }

    const status = input.outcome === 'upheld' ? 'upheld' : 'overturned';
    const { error: updateError } = await admin
      .from('appeals')
      .update({
        status,
        reviewed_by_user_id: reviewer.appUser.id,
        decision_notes: input.decisionNotes ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', appeal.id);
    if (updateError) throw new Error(`appeal update failed: ${updateError.message}`);

    await insertNotification(admin, {
      userId: appeal.appellant_user_id,
      type: 'appeal_decided',
      entityType: 'appeal',
      entityId: appeal.id,
      payload: { outcome: input.outcome },
    });

    await writeAudit(admin, {
      actorUserId: reviewer.appUser.id,
      action: `appeal.${input.outcome}`,
      targetType: 'appeal',
      targetId: appeal.id,
      metadata: { modActionId: modAction.id, originalAction: modAction.action },
    });

    return apiOk({ appeal: { id: appeal.id, status } });
  } catch (error) {
    return handleApiError(error);
  }
}
