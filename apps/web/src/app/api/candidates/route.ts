import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser, requireUser } from '@/lib/auth/guards';
import { candidateListQuerySchema } from '@/lib/capital/schemas';
import { listCandidates } from '@/lib/capital/views';
import { decodeCursor, encodeCursor } from '@/lib/pagination';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Capital candidate collection (§10/§17). GET is the readable-candidate browse
 * (keyset, newest first, optional ?labId ?status) — reads run under the caller's
 * RLS so can_read_candidate governs draft/reviewers-only/members visibility and
 * a hidden candidate simply doesn't appear.
 *
 * POST (direct candidate creation) is RETIRED while candidate submission is
 * paused (Xidig Plus doctrine, owner 12 Sep: "pause, don't broaden"). It used
 * to need the paid builder_path capability and admitted any non-observer
 * member of any Space, in any mode, with no notice to the lead. Nothing in the
 * UI called it. It now refuses every caller with put_forward_under_review
 * before reading the body. A future approved rule (active Space owner or
 * admin, under platform criteria) belongs in one reviewed entrance, not here.
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

export async function POST(): Promise<Response> {
  try {
    await requireActiveUser();
    throw new ApiError('put_forward_under_review', 403);
  } catch (error) {
    return handleApiError(error);
  }
}
