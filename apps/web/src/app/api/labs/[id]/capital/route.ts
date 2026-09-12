import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser, requireUser } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import { getVentureCapital, getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Capital (7f) — the declared need, "Baahida la sheegay", and the decision
 * behind it. That is the entire surface.
 *
 * **There is no pledge endpoint, and there must not be one.** Pledging ships as
 * a control that is present in the DOM and disabled with the escrow reason:
 * "Qaybtan dhan waa la dhisay, laakiin lacag ma dhaqaaqi karto." A route here
 * would be a claim that money can move, and a disabled button in front of a
 * working endpoint is a worse lie than no button at all. When escrow exists,
 * this file gains a sibling — until then its absence is the honest part.
 *
 * GET is RLS-scoped: `venture_capital_needs` is members-or-mods, so a stranger
 * reads `need: null` and still sees the locked structure the frame describes.
 * Needs recorded before the pause stay readable here, unchanged.
 *
 * POST is PAUSED (owner ruling, 12 Sep). Even with no money moving and no tier
 * consulted, declaring a need is capital-adjacent and can read as an active
 * funding path, so it waits for the capital/P3 review with legal and product
 * approval. The refusal is `capital_pathway_under_review` — neutral, CTA-free —
 * and it comes only after the active-account guard and the leadership check,
 * so only someone who could have declared a need is told the pathway is under
 * review. Nothing is parsed, rate-limited, written or logged, and the tier is
 * never consulted. Reversal is restoring the pre-pause handler from history.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const lab = await loadVentureForViewer(ctx, id);
    return apiOk(await getVentureCapital(ctx, lab));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const id = parseLabId((await context.params).id);

    const lab = await loadVentureForViewer(ctx, id);
    const viewer = await getVentureViewer(ctx, lab, getSupabaseAdmin());
    if (!viewer.isLead && !viewer.canManage) throw new ApiError('forbidden', 403);

    throw new ApiError('capital_pathway_under_review', 403);
  } catch (error) {
    return handleApiError(error);
  }
}
