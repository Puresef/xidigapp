import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import { LAB_WRITE_LIMIT, RATE_WINDOW_DAY_SECONDS } from '@/lib/labs/constants';
import { capitalNeedSchema } from '@/lib/maal/schemas';
import { declareCapitalNeed } from '@/lib/maal/service';
import { getVentureCapital, getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { enforceRateLimit } from '@/lib/rate-limit';
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
 * POST records a need — a governance act, so leadership only, and the optional
 * `decisionId` is validated against this venture's own decision log.
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

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = capitalNeedSchema.parse(await request.json());

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    if (!viewer.isLead && !viewer.canManage) throw new ApiError('forbidden', 403);

    await enforceRateLimit(`maal:capital:${ctx.appUser.id}`, {
      max: LAB_WRITE_LIMIT,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });

    const need = await declareCapitalNeed(admin, lab, ctx.appUser.id, input);
    return apiOk(need, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
