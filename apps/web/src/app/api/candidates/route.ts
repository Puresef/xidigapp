import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { hasCapability } from '@/lib/capital/candidates-api';
import { candidateCreateSchema, candidateListQuerySchema } from '@/lib/capital/schemas';
import { listCandidates } from '@/lib/capital/views';
import { getLabMembership } from '@/lib/labs-api';
import { decodeCursor, encodeCursor } from '@/lib/pagination';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Capital candidate collection (§10/§17). GET is the readable-candidate browse
 * (keyset, newest first, optional ?labId ?status) — reads run under the caller's
 * RLS so can_read_candidate governs draft/reviewers-only/members visibility and
 * a hidden candidate simply doesn't appear.
 *
 * POST creates a DRAFT candidate. It requires the builder_path capability
 * (Supporter) AND active membership (or lead) of the target Lab — the entry to
 * the Capital ladder from within a Lab. Inserts go through the service role (no
 * client write policy on venture_candidates).
 */

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = candidateListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const admin = getSupabaseAdmin();

    const result = await listCandidates(ctx.supabase, admin, {
      ...(params.labId ? { labId: params.labId } : {}),
      ...(params.status ? { status: params.status } : {}),
      cursor: decodeCursor(params.cursor),
    });

    return apiOk({
      items: result.items,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = candidateCreateSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    // Creating a Candidate is a builder-path (Supporter) capability.
    if (!(await hasCapability(ctx, 'builder_path'))) {
      throw new ApiError('not_supporter', 403);
    }

    // Must belong to (or lead) the Lab this Candidate is created under. Load the
    // Lab authoritatively (service role) and check lead + active membership.
    const { data: lab, error: labError } = await admin
      .from('labs')
      .select('id, lead_user_id, space_mode')
      .eq('id', input.labId)
      .maybeSingle();
    if (labError) throw new Error(`lab lookup failed: ${labError.message}`);
    if (!lab) throw new ApiError('not_found', 404);

    const isLead = lab.lead_user_id === ctx.appUser.id || ctx.appUser.role === 'admin';
    if (!isLead) {
      const membership = await getLabMembership(admin, lab.id, ctx.appUser.id);
      if (!membership || membership.status !== 'active' || membership.role === 'observer') {
        throw new ApiError('forbidden', 403);
      }
    }

    const { data: created, error } = await admin
      .from('venture_candidates')
      .insert({
        lab_id: input.labId,
        created_by_user_id: ctx.appUser.id,
        name: input.name,
        one_liner: input.oneLiner ?? null,
        status: 'draft',
      })
      .select('id')
      .single();
    if (error || !created) throw new Error(`candidate insert failed: ${error?.message ?? 'no row'}`);

    // Phase 7: analytics (candidate lifecycle events fire at submit/review).
    return apiOk({ candidateId: created.id }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
