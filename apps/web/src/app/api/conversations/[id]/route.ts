import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadConversationForUser, otherParticipant } from '@/lib/dm/service';
import { participantProfile, presentConversationStatus } from '@/lib/dm/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/** Conversation header: status, my role, and the other participant. */

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new ApiError('not_found', 404);

    const admin = getSupabaseAdmin();
    const convo = await loadConversationForUser(admin, parsed.data.id, ctx.appUser.id);
    if (!convo) throw new ApiError('not_found', 404);

    const other = await participantProfile(admin, otherParticipant(convo, ctx.appUser.id));

    // SILENT DECLINE (f5): the initiator of a declined request is never told.
    // The header presents 'pending' — identical copy, identical locked
    // composer — so the sender's view of declined and unanswered is one and
    // the same. (The recipient who declined keeps the true status; their
    // inbox already dropped the row.)
    const isInitiator = convo.initiator_user_id === ctx.appUser.id;
    const presentedStatus = presentConversationStatus(convo.status, isInitiator);

    return apiOk({
      conversation: {
        id: convo.id,
        status: presentedStatus,
        isInitiator,
        other,
        createdAt: convo.created_at,
        updatedAt: convo.updated_at,
        acceptedAt: convo.accepted_at ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
