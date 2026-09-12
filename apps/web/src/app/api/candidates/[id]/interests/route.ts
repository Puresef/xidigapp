import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadCandidateForViewer, parseCandidateId } from '@/lib/capital/candidates-api';
import { candidateInterestSchema, interestTypeSchema } from '@/lib/capital/schemas';
import { toInterestCounts, type InterestCounts } from '@/lib/capital/interest-counts';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Candidate interest signals.
 *
 *   help  ("I can help")  — non-financial, any member, NEVER gated.
 *   cosign (Garab)        — non-financial, any member, NEVER gated. Shown as
 *                           "Support"; the slug stays 'cosign'.
 *   invest                — SUBMISSION DISABLED (A2 containment): Xidig does
 *                           not currently offer investment, so a new invest
 *                           intent is refused with the truthful
 *                           capital_unavailable error before any candidate
 *                           lookup. Not a geography rule — availability is
 *                           the reason. No gate evaluation, no gate logging,
 *                           no row. DELETE still lets a member retract an
 *                           invest intent recorded while the old funnel was
 *                           live (data control, not promotion); other
 *                           existing rows are retained untouched pending the
 *                           owner's retention ruling (reconciliation Q2).
 *
 * No interest type awards a badge: the Early Backer award (previously granted
 * on cosign AND invest) is stopped — a financially-connoted badge must not
 * ride a non-financial support gesture, and no invest path exists. The badge
 * definition and historically awarded badges are retained as truthful history.
 *
 * Reading a candidate is required for help/cosign (a hidden candidate is a
 * 404). Writes go through the service role; counts return via
 * candidate_interest_counts, projected to help + cosign only — the legacy
 * invest tally never leaves the server (lib/capital/interest-counts.ts).
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

async function readCounts(
  admin: ReturnType<typeof getSupabaseAdmin>,
  candidateId: string,
): Promise<InterestCounts> {
  const { data, error } = await admin.rpc('candidate_interest_counts', { cand: candidateId });
  if (error) throw new Error(`interest counts failed: ${error.message}`);
  return toInterestCounts(data);
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const input = candidateInterestSchema.parse(await request.json());

    // A2 containment: new invest intent is not offered — refused before any
    // candidate lookup (the refusal reveals nothing about the candidate).
    if (input.type === 'invest') throw new ApiError('capital_unavailable', 403);

    const admin = getSupabaseAdmin();

    // Must be able to read the candidate to express interest on it.
    await loadCandidateForViewer(ctx, id);

    const { error } = await admin.from('interests').upsert(
      {
        candidate_id: id,
        user_id: ctx.appUser.id,
        type: input.type,
        message: input.message ?? null,
      },
      { onConflict: 'candidate_id,user_id,type' },
    );
    if (error) throw new Error(`interest upsert failed: ${error.message}`);

    emitServer(event('interest_expressed', { type: input.type, scope: 'candidate' }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ counts: await readCounts(admin, id), type: input.type });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    // Retract a specific interest type (?type=help|cosign|invest).
    const type = interestTypeSchema.parse(new URL(request.url).searchParams.get('type'));
    const admin = getSupabaseAdmin();

    await loadCandidateForViewer(ctx, id);

    const { error } = await admin
      .from('interests')
      .delete()
      .eq('candidate_id', id)
      .eq('user_id', ctx.appUser.id)
      .eq('type', type);
    if (error) throw new Error(`interest retract failed: ${error.message}`);

    return apiOk({ counts: await readCounts(admin, id), type });
  } catch (error) {
    return handleApiError(error);
  }
}
