import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getLabMembership, parseLabId } from '@/lib/labs-api';
import { LAB_WRITE_LIMIT, RATE_WINDOW_DAY_SECONDS } from '@/lib/labs/constants';
import { boardQuerySchema, taskCreateSchema } from '@/lib/maal/schemas';
import { createTask } from '@/lib/maal/service';
import { getVentureBoard, getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The work board (7c): Qorshe / Socda / "Marag & ansixin" / Dhammaystiran.
 *
 * GET returns the whole board in one read — four columns, their counts, the
 * workstream filter chips and the viewer's own hours this week. `venture_tasks`
 * is members-only in RLS, so a non-member gets four empty columns rather than a
 * 403: the overview above still tells them what the venture is, which is what
 * 7e promises.
 *
 * POST creates a task. Any active non-observer member may — the board is shared
 * work, not a lead's queue — and an assignee named at creation makes the task
 * start `claimed` (the DB CHECK refuses a non-open task with no assignee).
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * `venture_tasks.workstream_id` is an FK to venture_workstreams across EVERY
 * venture, so filing a card under someone else's box is a valid insert and an
 * invisible card (the board resolves names within one lab). 400 instead.
 */
async function requireOwnWorkstream(
  admin: SupabaseClient<Database>,
  labId: string,
  workstreamId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('venture_workstreams')
    .select('id')
    .eq('id', workstreamId)
    .eq('lab_id', labId)
    .maybeSingle();
  if (error) throw new Error(`workstream check failed: ${error.message}`);
  if (!data) throw new ApiError('invalid_request', 400);
}

export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const query = boardQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    const lab = await loadVentureForViewer(ctx, id);
    return apiOk(await getVentureBoard(ctx, lab, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = taskCreateSchema.parse(await request.json());

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    if (!viewer.canContribute) throw new ApiError('forbidden', 403);

    // An assignee is a promise about who is doing the work — it must be someone
    // in the venture (the FK only says "a user exists").
    if (input.assigneeUserId && input.assigneeUserId !== lab.lead_user_id) {
      const membership = await getLabMembership(admin, lab.id, input.assigneeUserId);
      if (membership?.status !== 'active') throw new ApiError('invalid_request', 400);
    }
    // Likewise the workstream: the FK spans every venture, so a card could
    // otherwise be filed under another venture's box and vanish from the filter.
    if (input.workstreamId) await requireOwnWorkstream(admin, lab.id, input.workstreamId);

    // A card is cheap to create and cheap to script; same daily budget as the
    // other Space writes.
    await enforceRateLimit(`maal:task:${ctx.appUser.id}`, {
      max: LAB_WRITE_LIMIT,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });

    const task = await createTask(admin, lab, ctx.appUser.id, input);
    return apiOk({ task }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
