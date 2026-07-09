import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  loadCandidateForViewer,
  parseCandidateId,
  requireCandidateManager,
} from '@/lib/capital/candidates-api';
import { voteWindow } from '@/lib/capital/tally';
import { getCandidateView } from '@/lib/capital/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Submit a candidate for review (§17): draft → submitted. Only the creator or a
 * Lab lead/core (or admin) may submit, and only FROM the draft state — a
 * candidate already submitted/in-review/decided is not resubmittable
 * (candidate_not_submittable). Submitting stamps submitted_at and OPENS the
 * 7-day Supporter governance vote window (vote_opens_at=now,
 * vote_closes_at=now+7d) computed by voteWindow(). Writes via the service role.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const admin = getSupabaseAdmin();

    const cand = await loadCandidateForViewer(ctx, id);
    await requireCandidateManager(admin, ctx, cand);
    if (cand.status !== 'draft') throw new ApiError('candidate_not_submittable', 409);

    const now = new Date();
    const window = voteWindow(now);

    const { error } = await admin
      .from('venture_candidates')
      .update({
        status: 'submitted',
        submitted_at: now.toISOString(),
        vote_opens_at: window.opensAt.toISOString(),
        vote_closes_at: window.closesAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', id)
      .eq('status', 'draft'); // guard against a concurrent double-submit
    if (error) throw new Error(`candidate submit failed: ${error.message}`);

    emitServer(event('candidate_submitted', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    const view = await getCandidateView(ctx.supabase, admin, id, ctx.appUser.id);
    if (!view) throw new ApiError('not_found', 404);
    return apiOk({ candidate: view });
  } catch (error) {
    return handleApiError(error);
  }
}
