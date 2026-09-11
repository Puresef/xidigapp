import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser, requireUser } from '@/lib/auth/guards';
import { getLabMembership, parseLabId } from '@/lib/labs-api';
import { LAB_WRITE_LIMIT, RATE_WINDOW_DAY_SECONDS } from '@/lib/labs/constants';
import { attachAuthors } from '@/lib/labs/views';
import { workstreamCreateSchema } from '@/lib/maal/schemas';
import { createWorkstream } from '@/lib/maal/service';
import {
  getVentureViewer,
  loadVentureForViewer,
  WORKSTREAM_COLUMNS,
  type WorkstreamRow,
} from '@/lib/maal/views';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Workstreams — "Qaybaha shaqada" (7b), and the open seats a non-member is shown
 * before joining (7e).
 *
 * GET runs under the CALLER's RLS, whose policy is `can_read_lab` rather than
 * membership: the structure of a venture is the part 7e promises the public can
 * see, so a stranger gets the list and an empty board.
 *
 * POST is structural, so it is leadership-only (lead, core member, or platform
 * admin) and service-role after that check — `venture_workstreams` has no client
 * write grant at all.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);

    const { data, error } = await ctx.supabase
      .from('venture_workstreams')
      .select(WORKSTREAM_COLUMNS)
      .eq('lab_id', id)
      .order('position', { ascending: true });
    if (error) throw new Error(`workstreams query failed: ${error.message}`);

    const admin = getSupabaseAdmin();
    // author === the named owner; null is "Boos furan", a state and not a gap.
    const items = await attachAuthors(
      admin,
      (data ?? []) as unknown as WorkstreamRow[],
      'owner_user_id',
    );
    return apiOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const id = parseLabId((await context.params).id);
    const input = workstreamCreateSchema.parse(await request.json());

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    if (!viewer.isLead && !viewer.canManage) throw new ApiError('forbidden', 403);

    // `owner_user_id` is an FK to users, not to lab_members, so nothing in the
    // DB stops a stranger being named a "Mas'uul". 7b renders that name as the
    // person accountable for the work — it has to be someone who is in.
    if (input.ownerUserId && input.ownerUserId !== lab.lead_user_id) {
      const membership = await getLabMembership(admin, lab.id, input.ownerUserId);
      if (membership?.status !== 'active') throw new ApiError('invalid_request', 400);
    }

    await enforceRateLimit(`maal:workstream:${ctx.appUser.id}`, {
      max: LAB_WRITE_LIMIT,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });

    const workstream = await createWorkstream(admin, lab, ctx.appUser.id, input);
    return apiOk({ workstream }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
