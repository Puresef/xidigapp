import { ApiError, apiNotice, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { resolveSubjectUser } from '@/lib/moderation/actions';
import { APPEAL_RATE } from '@/lib/moderation/constants';
import { appealSubmitSchema } from '@/lib/moderation/schemas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Author appeal submission (§19 "appeal any moderation action"). The caller
 * must be the SUBJECT of the mod_action being appealed — the content author, or
 * the user themselves for a user-level sanction — resolved through the same
 * resolveSubjectUser() the report-decision route uses so eligibility can't
 * drift. One appeal per action is enforced in the DB (appeals_one_per_action
 * unique) so a fail-open rate limiter can't open a second window. All writes
 * are service role: appeals has no client write grant; appellants read their
 * own rows via RLS.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = appealSubmitSchema.parse(await request.json());
    await enforceRateLimit(`appeal:${ctx.appUser.id}`, APPEAL_RATE);

    const admin = getSupabaseAdmin();

    const { data: modAction, error: loadError } = await admin
      .from('mod_actions')
      .select('id, target_type, target_id')
      .eq('id', input.modActionId)
      .maybeSingle();
    if (loadError) throw new Error(`mod action lookup failed: ${loadError.message}`);
    if (!modAction) throw new ApiError('not_found', 404);

    // Eligibility: only the member the action landed on may appeal it.
    const subject = await resolveSubjectUser(admin, modAction.target_type, modAction.target_id);
    if (subject !== ctx.appUser.id) throw new ApiError('appeal_not_eligible', 403);

    const { data: appeal, error: insertError } = await admin
      .from('appeals')
      .insert({
        mod_action_id: modAction.id,
        appellant_user_id: ctx.appUser.id,
        body: input.body,
      })
      .select('id')
      .maybeSingle();
    if (insertError) {
      // appeals_one_per_action unique — a member already appealed this action.
      if (insertError.code === '23505' || /duplicate|unique/i.test(insertError.message)) {
        throw new ApiError('appeal_already_submitted', 409);
      }
      throw new Error(`appeal insert failed: ${insertError.message}`);
    }

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'appeal.submitted',
      targetType: 'appeal',
      targetId: appeal?.id,
      metadata: { modActionId: modAction.id },
    });

    return apiNotice('appeal_submitted');
  } catch (error) {
    return handleApiError(error);
  }
}
