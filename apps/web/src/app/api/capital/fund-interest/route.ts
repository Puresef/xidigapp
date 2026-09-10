import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Fund-level invest intent — SUBMISSION DISABLED (A2 containment).
 *
 * Xidig does not currently offer investment: no approved fund, no offering,
 * no intent capture. POST refuses every caller with the truthful
 * capital_unavailable error (never a geography message — availability is the
 * reason), creates no row, evaluates no gate, and awards no badge.
 *
 * DELETE is deliberately KEPT: a member who registered fund interest while
 * the old funnel was live may still withdraw their own standing record —
 * that is data control, not promotion. Existing interest rows are otherwise
 * retained untouched pending the owner's retention ruling (reconciliation
 * Q2); nothing displays or advertises them.
 *
 * Reactivation requires the PRD §15/D-08 legal gates plus an explicit code
 * change here, never a flag flip.
 */

export async function POST(): Promise<Response> {
  try {
    await requireUser();
    throw new ApiError('capital_unavailable', 403);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const admin = getSupabaseAdmin();

    const { error } = await admin
      .from('interests')
      .delete()
      .eq('user_id', ctx.appUser.id)
      .is('candidate_id', null)
      .eq('type', 'invest');
    if (error) throw new Error(`fund interest delete failed: ${error.message}`);

    return apiOk({ registered: false });
  } catch (error) {
    return handleApiError(error);
  }
}
