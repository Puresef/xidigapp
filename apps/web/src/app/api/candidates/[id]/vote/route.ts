import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser, requireUser } from '@/lib/auth/guards';
import { loadCandidateForViewer, parseCandidateId } from '@/lib/capital/candidates-api';
import { voteWindow } from '@/lib/capital/tally';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { CandidateRow } from '@/lib/capital/views';

/** Statuses whose (old) vote window a ballot may still be withdrawn from. */
const VOTABLE_STATUSES = new Set<CandidateRow['status']>(['submitted', 'in_review']);

/**
 * Candidate vote (§12/§17). PAUSED (Xidig Plus doctrine, owner 12 Sep: "pause,
 * don't broaden"). The vote was gated on the paid tier's vote_candidate
 * capability. Xidig Plus must not decide voting eligibility, and no non-paid
 * eligibility model is approved yet, so:
 *
 *   - POST (cast) refuses EVERY caller with vote_eligibility_under_review,
 *     before any lookup. The tier is never consulted.
 *   - DELETE (withdraw your own ballot) stays open as data control, like the
 *     A2 retraction precedent, for a still-open window on a votable candidate.
 *     No tier check: it can only remove the caller's own row.
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

    const cand = await loadCandidateForViewer(ctx, id);
    // Withdrawal follows the window it was cast in: a decided candidate, or
    // one whose window has closed, keeps its record unchanged.
    if (!VOTABLE_STATUSES.has(cand.status) || !cand.vote_opens_at) {
      throw new ApiError('vote_closed', 409);
    }
    const now = new Date();
    const closes = cand.vote_closes_at
      ? new Date(cand.vote_closes_at)
      : voteWindow(cand.vote_opens_at).closesAt;
    if (!(now >= new Date(cand.vote_opens_at) && now < closes)) {
      throw new ApiError('vote_closed', 409);
    }

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
