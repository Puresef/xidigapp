import { ApiError, handleApiError } from '@/lib/api';
import { requireActiveUser } from '@/lib/auth/guards';
import {
  loadCandidateForViewer,
  parseCandidateId,
  requireCandidateManager,
} from '@/lib/capital/candidates-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Submit a candidate for review (§17): draft → submitted. PAUSED (Xidig Plus
 * doctrine, owner 12 Sep: "pause, don't broaden").
 *
 * The owner's direction is review submission by an active Space/project owner
 * or admin, under platform criteria and not paid status. Those criteria do not
 * exist yet, so no safe non-paid rule can be implemented in this slice, and
 * submission is paused rather than broadened. Every manager (creator, lead/core
 * or admin) is refused with put_forward_under_review. Nothing is written: no
 * submitted_at, no vote window (candidate voting is paused too), no analytics
 * event. A draft stays a draft and stays editable. Reviewers keep reviewing
 * candidates that were already submitted.
 *
 * The manager check still runs first, so the refusal only answers someone who
 * could have submitted.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const id = parseCandidateId((await context.params).id);
    const admin = getSupabaseAdmin();

    const cand = await loadCandidateForViewer(ctx, id);
    await requireCandidateManager(admin, ctx, cand);
    throw new ApiError('put_forward_under_review', 403);
  } catch (error) {
    return handleApiError(error);
  }
}
