import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadConversationForUser, otherParticipant } from '@/lib/dm/service';
import { participantProfile } from '@/lib/dm/views';
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

    return apiOk({
      conversation: {
        id: convo.id,
        status: convo.status,
        isInitiator: convo.initiator_user_id === ctx.appUser.id,
        other,
        createdAt: convo.created_at,
        updatedAt: convo.updated_at,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
