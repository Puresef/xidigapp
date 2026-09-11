import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser, requireUser } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import { CONTRIBUTION_LOG_LIMIT, RATE_WINDOW_DAY_SECONDS } from '@/lib/maal/constants';
import { contributionLogSchema, ledgerQuerySchema } from '@/lib/maal/schemas';
import { logContribution } from '@/lib/maal/service';
import { getVentureLedger, getVentureViewer, loadVentureForViewer } from '@/lib/maal/views';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The contribution ledger (7d desktop, 7g mobile — ONE model, full capability on
 * both, ruling 1).
 *
 * GET returns the member table, the four stat cards, the current weight scheme
 * and the event trail. Readability is decided in getVentureLedger BEFORE the
 * SECURITY DEFINER tally RPC is called: a caller who may not read this ledger
 * gets a 403, never a zeroed table — a zeroed table would be a lie about the
 * venture instead of a statement about the caller.
 *
 * POST appends one contribution. The client sends "3 hours", never "3 hours at
 * weight 40": the weight comes from the venture's current voted scheme and the
 * units are derived from it, and the DB CHECK re-derives the same number. `seq`,
 * `prev_hash` and `hash` are the trigger's, not ours.
 *
 * `occurredAt` is the member's own statement of WHEN the work happened, and it
 * is the timestamp that survives — state m5 replays a queued log hours after the
 * fact and the send time must never overwrite the true one.
 *
 * There is no PATCH and no DELETE here, at any status code. The ledger is
 * append-only for every role including service_role; a correction is
 * .../[eventId]/reverse, which appends the negation.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * `work_events.task_id` is an FK to venture_tasks across EVERY venture. An event
 * hung off another venture's card would be a valid insert, an unreadable "{task}"
 * in the trail, and a permanent one — the row cannot be edited afterwards. 400.
 */
async function requireOwnTask(
  admin: SupabaseClient<Database>,
  labId: string,
  taskId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('venture_tasks')
    .select('id')
    .eq('id', taskId)
    .eq('lab_id', labId)
    .maybeSingle();
  if (error) throw new Error(`task check failed: ${error.message}`);
  if (!data) throw new ApiError('invalid_request', 400);
}

export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const query = ledgerQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    const lab = await loadVentureForViewer(ctx, id);
    return apiOk(await getVentureLedger(ctx, lab, query));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const id = parseLabId((await context.params).id);
    const input = contributionLogSchema.parse(await request.json());

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    // `canContribute` alone, deliberately. The 7b ledger toggle is a VISIBILITY
    // choice ("Qof kastaa wuu arkaa waxa kastaa ku daray"), and a venture that
    // narrows reading to its leads has not decided its members may no longer
    // work. Gating the write on the read would turn a display preference into a
    // capability removal — the same mistake as gating a write path on Lite.
    if (!viewer.canContribute) throw new ApiError('forbidden', 403);

    if (input.taskId) await requireOwnTask(admin, lab.id, input.taskId);

    // The one write on this surface a script could turn into a share. Per
    // member per day, across every venture they are in.
    await enforceRateLimit(`maal:log:${ctx.appUser.id}`, {
      max: CONTRIBUTION_LOG_LIMIT,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });

    const contribution = await logContribution(admin, lab, ctx.appUser.id, input);
    return apiOk({ contribution }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
