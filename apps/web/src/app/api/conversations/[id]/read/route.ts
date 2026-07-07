import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadConversationForUser } from '@/lib/dm/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mark a conversation read up to now for the calling participant (Checkpoint 4
 * read state). Sets the caller's own last_read_at column (initiator vs
 * recipient) — never the other party's — so unread counts decrement only for
 * the reader. API-only (service role): the update is column-role-sensitive and
 * conversations carry no client write grant.
 */

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
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

    const now = new Date().toISOString();
    const patch =
      convo.initiator_user_id === ctx.appUser.id
        ? { initiator_last_read_at: now }
        : { recipient_last_read_at: now };

    const { error } = await admin.from('conversations').update(patch).eq('id', convo.id);
    if (error) throw new Error(`mark-read failed: ${error.message}`);

    return apiOk({ readAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}
