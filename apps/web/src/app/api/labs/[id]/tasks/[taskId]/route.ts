import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@xidig/db';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireActiveUser } from '@/lib/auth/guards';
import { parseLabId } from '@/lib/labs-api';
import type { TaskTransitionInput } from '@/lib/maal/schemas';
import { taskTransitionSchema, taskUpdateSchema } from '@/lib/maal/schemas';
import { transitionTask, updateTask } from '@/lib/maal/service';
import { getVentureViewer, loadVentureForViewer, type VentureViewer } from '@/lib/maal/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * One card on the board. A body carrying `status` is a MOVE
 * (open → claimed → submitted → attested → verified, plus claimed → open to put
 * something back down); anything else is an edit of the card's own text.
 *
 * The move is the endpoint that matters. Recusal — you never witness or approve
 * your own work, and a lead is not the exception but the reason for the rule —
 * is a CHECK constraint on `venture_tasks`, and a constraint violation reaches a
 * member as a 500. So transitionTask() states the same rule first and answers
 * `task_recusal` 403 with the sentence that explains it; the CHECK stays as the
 * thing that is actually true, not as the thing that talks to people.
 *
 * The same applies to the two other refusals a move can hit: an illegal step
 * (409 invalid_request), and verification by someone who is not a lead (403).
 *
 * And to a fourth, enforced HERE: a claimed card belongs to whoever claimed it.
 * See requireClaimHolder() — the move rules alone would let any contributing
 * member drop someone else's claim or submit their work for them.
 */

interface Ctx {
  params: Promise<{ id: string; taskId: string }>;
}

const uuidSchema = z.string().uuid();

/** Invalid uuid → 404, the same posture parseLabId takes. */
function parseTaskId(raw: string): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

/**
 * `venture_tasks.workstream_id` is an FK to venture_workstreams across EVERY
 * venture, so re-filing a card under someone else's box is a valid update and an
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

/**
 * A claimed card belongs to the member who claimed it.
 *
 * `TASK_TRANSITIONS` says claimed → open and claimed → submitted are legal
 * moves, which they are — but it says nothing about WHO makes them, and the
 * route's `canContribute` check answers "a member of this venture", not "this
 * member". Without this, anyone in the venture could put down work someone else
 * picked up, or submit it on their behalf — and a submission is the step that
 * carries the work into attestation, where it becomes units in the ledger.
 * Nobody hands in someone else's work.
 *
 * The one exception is releasing: a lead may put a claimed card back on the
 * board (the reassign affordance — a member who has gone quiet must not hold a
 * workstream hostage). Submitting has no exception at all, lead included: the
 * assignee is the only person who can say the work is done, and a lead who
 * could submit for someone could then witness what they submitted.
 *
 * This lives in the route because `transitionTask()` is not ours to edit in
 * this dispatch (`lib/maal/service.ts`). The service's own optimistic
 * `.eq('status', …)` bounds the gap between this read and its write; a card
 * that changes hands in between simply fails its move rather than moving wrong.
 */
async function requireClaimHolder(
  admin: SupabaseClient<Database>,
  labId: string,
  taskId: string,
  viewer: VentureViewer,
  input: TaskTransitionInput,
): Promise<void> {
  if (input.status !== 'open' && input.status !== 'submitted') return;

  const { data, error } = await admin
    .from('venture_tasks')
    .select('status, assignee_user_id')
    .eq('id', taskId)
    .eq('lab_id', labId)
    .maybeSingle();
  if (error) throw new Error(`task claim check failed: ${error.message}`);
  // No row, or a card that is not claimed: transitionTask() owns those answers
  // (404 and 409) and must keep owning them — two sources for one sentence is
  // how the two drift apart.
  if (!data || data.status !== 'claimed') return;

  if (data.assignee_user_id === viewer.userId) return;
  if (input.status === 'open' && viewer.isLead) return;
  throw new ApiError('forbidden', 403);
}

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireActiveUser();
    const params = await context.params;
    const id = parseLabId(params.id);
    const taskId = parseTaskId(params.taskId);

    const raw: unknown = await request.json();
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ApiError('invalid_request', 400);
    }
    const body = raw as Record<string, unknown>;

    const lab = await loadVentureForViewer(ctx, id);
    const admin = getSupabaseAdmin();
    const viewer = await getVentureViewer(ctx, lab, admin);
    if (!viewer.canContribute) throw new ApiError('forbidden', 403);

    if ('status' in body) {
      const input = taskTransitionSchema.parse(body);
      await requireClaimHolder(admin, lab.id, taskId, viewer, input);
      const task = await transitionTask(admin, lab, ctx.appUser.id, taskId, input);
      return apiOk({ task });
    }

    const input = taskUpdateSchema.parse(body);
    if (input.workstreamId) await requireOwnWorkstream(admin, lab.id, input.workstreamId);
    const task = await updateTask(admin, lab, ctx.appUser.id, taskId, input);
    return apiOk({ task });
  } catch (error) {
    return handleApiError(error);
  }
}
