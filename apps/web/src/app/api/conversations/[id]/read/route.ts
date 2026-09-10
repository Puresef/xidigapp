import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadConversationForUser } from '@/lib/dm/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mark a conversation read up to now for the calling participant (Checkpoint 4
 * read state). Upserts the caller's OWN dm_read_states row — read state lives
 * in a per-user table off the shared conversations row (A5a follow-up), so a
 * read-mark emits no realtime event the counterpart can receive and can never
 * disclose the other party's read time. API-only (service role): dm_read_states
 * carries no client write grant.
 *
 * ACCEPTED threads only (A5a): a pending request must generate no read-state
 * at all — the requestExplainer promises the sender "{name} can't see that
 * you've read it", and this route is the only writer, so the promise is
 * enforced here at the wire, not just by the client's markRead gating. A
 * blocked thread records nothing either. Both are a 200 no-op (readAt: null)
 * rather than an error: idempotent, and a direct caller learns nothing they
 * did not already know as a participant.
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
    if (convo.status !== 'accepted') return apiOk({ readAt: null });

    const now = new Date().toISOString();
    const { error } = await admin
      .from('dm_read_states')
      .upsert(
        { conversation_id: convo.id, user_id: ctx.appUser.id, last_read_at: now },
        { onConflict: 'conversation_id,user_id' },
      );
    if (error) throw new Error(`mark-read failed: ${error.message}`);

    return apiOk({ readAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}
