import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser, requireUser } from '@/lib/auth/guards';
import { loadCandidateForViewer, parseCandidateId } from '@/lib/capital/candidates-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Candidate vote (§12/§17). PAUSED (Xidig Plus doctrine, owner 12 Sep: "pause,
 * don't broaden"). The vote was gated on the paid tier's vote_candidate
 * capability. Xidig Plus must not decide voting eligibility, and no non-paid
 * eligibility model is approved yet, so:
 *
 *   - POST (cast) refuses EVERY caller with vote_eligibility_under_review,
 *     before any lookup. The tier is never consulted.
 *   - DELETE (withdraw your own ballot) stays open as data control, like the
 *     A2 retraction precedent (the interests DELETE has no window or status
 *     gate either). Every stored ballot was cast under the old paid gate, and
 *     no new window can open while submission is paused, so withdrawal must not
 *     depend on a window. No tier check: it removes only the caller's own row,
 *     and the candidate must still be readable to them (RLS load → 404).
 *
 * No response carries a tally. Live counts are hidden while the vote is
 * paused, and candidate_vote_tally is server-only (migration 20260912100000).
 * Existing ballots are kept as restricted records and shown nowhere.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(): Promise<Response> {
  try {
    await requireActiveUser();
    throw new ApiError('vote_eligibility_under_review', 403);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const admin = getSupabaseAdmin();

    // RLS-scoped load: a candidate the caller cannot read is a plain 404.
    await loadCandidateForViewer(ctx, id);

    const { error } = await admin
      .from('candidate_votes')
      .delete()
      .eq('candidate_id', id)
      .eq('voter_user_id', ctx.appUser.id);
    if (error) throw new Error(`vote retract failed: ${error.message}`);

    return apiOk({ myVote: null });
  } catch (error) {
    return handleApiError(error);
  }
}
