import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadConversationForUser, respondToRequest } from '@/lib/dm/service';
import { respondSchema } from '@/lib/dm/schemas';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Accept or decline a pending DM request (§13). Only the recipient of a
 * pending request may respond; accept notifies the initiator, decline is
 * silent (the initiator sees the state in their inbox).
 */

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new ApiError('not_found', 404);
    const { action } = respondSchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    const convo = await loadConversationForUser(admin, parsed.data.id, ctx.appUser.id);
    if (!convo) throw new ApiError('not_found', 404);

    const updated = await respondToRequest(admin, ctx.appUser.id, convo, action);
    return apiOk({ conversationId: updated.id, status: updated.status });
  } catch (error) {
    return handleApiError(error);
  }
}
