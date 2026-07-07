import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  loadCandidateForViewer,
  parseCandidateId,
  requireReviewer,
} from '@/lib/capital/candidates-api';
import { candidateReviewSchema } from '@/lib/capital/schemas';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Reviewer rubric reviews (§17). GET lists all reviews for a candidate the
 * caller can read (reviews are visible wherever the candidate is). PUT upserts
 * the CALLER's own rubric review (one row per reviewer) — reviewer eligibility
 * is mod/admin AND recusal (requireReviewer → not_a_reviewer / reviewer_conflict).
 *
 * After every upsert we recompute the denormalized aggregate rubric_*_score on
 * venture_candidates as the mean of each present criterion across all reviews,
 * so the candidate view + card can show a rubric summary without re-aggregating.
 * All writes go through the service role.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const REVIEW_COLUMNS =
  'id, candidate_id, reviewer_user_id, team_score, traction_score, feasibility_score, notes, created_at, updated_at';

/** Mean of the present (non-null) values, rounded to 2dp; null when none. */
function meanOrNull(values: (number | null)[]): number | null {
  const present = values.filter((n): n is number => typeof n === 'number');
  if (present.length === 0) return null;
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100) / 100;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);

    // Candidate must be readable (404 otherwise); reviews follow can_read_candidate.
    await loadCandidateForViewer(ctx, id);

    const { data, error } = await ctx.supabase
      .from('candidate_reviews')
      .select(REVIEW_COLUMNS)
      .eq('candidate_id', id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`reviews query failed: ${error.message}`);

    return apiOk({ reviews: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const input = candidateReviewSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const cand = await loadCandidateForViewer(ctx, id);
    await requireReviewer(ctx, id);
    if (cand.status === 'draft') throw new ApiError('candidate_not_submittable', 409);

    // Upsert the caller's single review row (unique on candidate_id+reviewer).
    const now = new Date().toISOString();
    const { error: upsertError } = await admin.from('candidate_reviews').upsert(
      {
        candidate_id: id,
        reviewer_user_id: ctx.appUser.id,
        team_score: input.teamScore ?? null,
        traction_score: input.tractionScore ?? null,
        feasibility_score: input.feasibilityScore ?? null,
        notes: input.notes ?? null,
        updated_at: now,
      },
      { onConflict: 'candidate_id,reviewer_user_id' },
    );
    if (upsertError) throw new Error(`review upsert failed: ${upsertError.message}`);

    // Recompute the denormalized aggregate across ALL reviews (service role).
    const { data: allReviews, error: allError } = await admin
      .from('candidate_reviews')
      .select('team_score, traction_score, feasibility_score')
      .eq('candidate_id', id);
    if (allError) throw new Error(`review aggregate read failed: ${allError.message}`);

    const rows = allReviews ?? [];
    const { error: aggError } = await admin
      .from('venture_candidates')
      .update({
        rubric_team_score: meanOrNull(rows.map((r) => r.team_score)),
        rubric_traction_score: meanOrNull(rows.map((r) => r.traction_score)),
        rubric_feasibility_score: meanOrNull(rows.map((r) => r.feasibility_score)),
        updated_at: now,
      })
      .eq('id', id);
    if (aggError) throw new Error(`rubric aggregate write failed: ${aggError.message}`);

    // Phase 7: analytics (candidate_reviewed).
    const { data: review, error: readError } = await ctx.supabase
      .from('candidate_reviews')
      .select(REVIEW_COLUMNS)
      .eq('candidate_id', id)
      .eq('reviewer_user_id', ctx.appUser.id)
      .maybeSingle();
    if (readError) throw new Error(`review read-back failed: ${readError.message}`);

    return apiOk({ review });
  } catch (error) {
    return handleApiError(error);
  }
}
