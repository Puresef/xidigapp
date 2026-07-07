import type { TablesUpdate } from '@xidig/db';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  loadCandidateForViewer,
  parseCandidateId,
  requireReviewer,
} from '@/lib/capital/candidates-api';
import { candidateDecisionSchema } from '@/lib/capital/schemas';
import { getCandidateView } from '@/lib/capital/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Reviewer decision on a candidate (§17). Reviewer eligibility for v1.0 is
 * mod/admin AND recusal (not a member of the candidate's Lab) — requireReviewer
 * returns not_a_reviewer (403) to a plain member and reviewer_conflict (403) to
 * a recused mod. The decision sets the status (in_review | approved | parked |
 * declined) and an optional visible status_reason (decline/park reasons are
 * shown, §17). Terminal states (approved/parked/declined) stamp decided_at.
 * Writes go through the service role.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const TERMINAL_STATUSES = new Set(['approved', 'parked', 'declined']);

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const input = candidateDecisionSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    // Candidate must be readable (404 otherwise) before we spend a reviewer check.
    const cand = await loadCandidateForViewer(ctx, id);
    await requireReviewer(ctx, id);

    // A decision only makes sense once submitted — a still-draft candidate has
    // not entered review.
    if (cand.status === 'draft') throw new ApiError('candidate_not_submittable', 409);
    // The lifecycle draft→submitted→in_review→approved/parked/declined is
    // terminal at the last step: an already-decided candidate is not re-decided
    // (that would silently reopen it and overwrite the original decided_at that
    // feeds the public timeline). No reopen path exists in v1.0.
    if (TERMINAL_STATUSES.has(cand.status)) throw new ApiError('candidate_not_submittable', 409);

    const now = new Date();
    const patch: TablesUpdate<'venture_candidates'> = {
      status: input.status,
      status_reason: input.statusReason ?? null,
      updated_at: now.toISOString(),
    };
    // Stamp decided_at only on the first transition INTO a terminal state (the
    // current status is guaranteed non-terminal by the guard above).
    if (TERMINAL_STATUSES.has(input.status)) patch.decided_at = now.toISOString();

    const { error } = await admin.from('venture_candidates').update(patch).eq('id', id);
    if (error) throw new Error(`candidate decision failed: ${error.message}`);

    // Phase 7: analytics (candidate_reviewed).
    const view = await getCandidateView(ctx.supabase, admin, id, ctx.appUser.id);
    if (!view) throw new ApiError('not_found', 404);
    return apiOk({ candidate: view });
  } catch (error) {
    return handleApiError(error);
  }
}
