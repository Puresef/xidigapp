import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser } from '@/lib/auth/guards';
import { getLabMembership, parseLabId } from '@/lib/labs-api';
import { workstreamUpdateSchema } from '@/lib/maal/schemas';
import { deleteWorkstream, updateWorkstream } from '@/lib/maal/service';
import { getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * One workstream: rename it, re-order it, hand it over, open its seat
 * (`ownerUserId: null`), or remove it.
 *
 * Removal keeps the work: `venture_tasks.workstream_id` is ON DELETE SET NULL,
 * and the ledger events that point at those tasks are untouched by construction
 * — nothing about a contribution depends on the box the task sat in.
 *
 * Leadership-only (lead, core member, or platform admin), service-role after
 * the check.
 */

interface Ctx {
  params: Promise<{ id: string; wsId: string }>;
}

const uuidSchema = z.string().uuid();

/** Invalid uuid → 404, the same posture parseLabId takes: don't leak the shape. */
function parseWorkstreamId(raw: string): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const params = await context.params;
    const id = parseLabId(params.id);
    const workstreamId = parseWorkstreamId(params.wsId);
    const input = workstreamUpdateSchema.parse(await request.json());

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    if (!viewer.isLead && !viewer.canManage) throw new ApiError('forbidden', 403);

    // A named owner must actually be in the venture (the FK points at users,
    // not at lab_members). `null` is the open seat and skips the check.
    if (input.ownerUserId && input.ownerUserId !== lab.lead_user_id) {
      const membership = await getLabMembership(admin, lab.id, input.ownerUserId);
      if (membership?.status !== 'active') throw new ApiError('invalid_request', 400);
    }

    const workstream = await updateWorkstream(admin, lab, ctx.appUser.id, workstreamId, input);
    return apiOk({ workstream });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const params = await context.params;
    const id = parseLabId(params.id);
    const workstreamId = parseWorkstreamId(params.wsId);

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    if (!viewer.isLead && !viewer.canManage) throw new ApiError('forbidden', 403);

    await deleteWorkstream(admin, lab, ctx.appUser.id, workstreamId);
    return apiOk({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
