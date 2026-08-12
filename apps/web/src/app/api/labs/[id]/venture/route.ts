import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { hydrateOneLab, parseLabId, requireLabManager } from '@/lib/labs-api';
import { ventureGoalSchema, ventureVisibilitySchema } from '@/lib/maal/schemas';
import { updateVentureGoal, updateVentureVisibility } from '@/lib/maal/service';
import { getVentureOverview, loadVentureForViewer, type VentureRow } from '@/lib/maal/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The venture's own settings (frames 7b/7e).
 *
 * GET is the overview read model — charter, goal meter, workstreams, decisions,
 * members, applications, visibility, the dormant capital card and the demotion
 * clock. One model serves both 7b (member/lead) and 7e (non-member): 7e is this
 * page with an empty board and an empty ledger, which is exactly what RLS hands
 * a non-member back.
 *
 * PATCH is the goal meter + the two member-set visibility toggles, in one flat
 * body — the frame has them on one screen and a client may send either half.
 * Lead or platform admin only ("Xubnaha ayaa doortay" is about whose venture the
 * choice belongs to, not about who may flip the switch on their behalf).
 *
 * There is no `space_mode` here and never will be: stage goes UP through
 * /promote and comes DOWN only through the system timeout sweep.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const GOAL_KEYS = ['goalStatement', 'goalUnit', 'goalTarget', 'goalProgress'] as const;
const VISIBILITY_KEYS = ['ledgerVisibility', 'hoursVisibility'] as const;

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const lab = await loadVentureForViewer(ctx, id);
    return apiOk(await getVentureOverview(ctx, lab));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);

    const raw: unknown = await request.json();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ApiError('invalid_request', 400);
    }
    const body = raw as Record<string, unknown>;
    const wantsGoal = GOAL_KEYS.some((key) => key in body);
    const wantsVisibility = VISIBILITY_KEYS.some((key) => key in body);
    if (!wantsGoal && !wantsVisibility) throw new ApiError('invalid_request', 400);

    const lab = await loadVentureForViewer(ctx, id);
    requireLabManager(ctx, lab);
    const admin = getSupabaseAdmin();

    // Two writes, not one: the goal and the toggles are separate Space History
    // entries because they are separate decisions, and each service call logs
    // exactly the fields it changed. Both schemas strip the other's keys.
    let updated: VentureRow = lab;
    if (wantsVisibility) {
      updated = await updateVentureVisibility(
        admin,
        updated,
        ctx.appUser.id,
        ventureVisibilitySchema.parse(body),
      );
    }
    if (wantsGoal) {
      updated = await updateVentureGoal(
        admin,
        updated,
        ctx.appUser.id,
        ventureGoalSchema.parse(body),
      );
    }

    return apiOk({ lab: await hydrateOneLab(admin, ctx.appUser.id, updated) });
  } catch (error) {
    return handleApiError(error);
  }
}
