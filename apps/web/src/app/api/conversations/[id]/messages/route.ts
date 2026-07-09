import { z } from 'zod';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  DM_MESSAGE_PAGE_MAX,
  DM_MESSAGE_PAGE_SIZE,
  MESSAGE_BURST_MAX,
  MESSAGE_BURST_WINDOW_SECONDS,
} from '@/lib/dm/constants';
import { loadConversationForUser, sendMessage } from '@/lib/dm/service';
import { sendMessageSchema } from '@/lib/dm/schemas';
import { loadMessagesPage, toMessageView } from '@/lib/dm/views';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Messages within a conversation.
 *
 *   GET  — keyset history (oldest→newest per page; "load older" walks back).
 *          RLS-scoped: a non-participant reads nothing.
 *   POST — send into an ACCEPTED thread. Enforces the accept gate + live block
 *          check + a per-minute flood throttle; notifies (new_dm push).
 *          Realtime delivers the INSERT to the other participant — no polling.
 */

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  cursor: z.string().nullish(),
  limit: z.coerce.number().int().min(1).max(DM_MESSAGE_PAGE_MAX).default(DM_MESSAGE_PAGE_SIZE),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new ApiError('not_found', 404);

    // Participation is enforced by RLS on the read below, but a fast 404 for a
    // non-participant avoids leaking "this conversation exists".
    const admin = getSupabaseAdmin();
    const convo = await loadConversationForUser(admin, parsed.data.id, ctx.appUser.id);
    if (!convo) throw new ApiError('not_found', 404);

    const url = new URL(request.url);
    const query = querySchema.parse({
      cursor: url.searchParams.get('cursor'),
      limit: url.searchParams.get('limit') ?? undefined,
    });

    const page = await loadMessagesPage(
      ctx.supabase,
      parsed.data.id,
      ctx.appUser.id,
      query.cursor ?? null,
      query.limit,
    );
    return apiOk(page);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new ApiError('not_found', 404);
    const { body } = sendMessageSchema.parse(await request.json());

    await enforceRateLimit(`dm_send:${ctx.appUser.id}`, {
      max: MESSAGE_BURST_MAX,
      windowSeconds: MESSAGE_BURST_WINDOW_SECONDS,
    });

    const admin = getSupabaseAdmin();
    const convo = await loadConversationForUser(admin, parsed.data.id, ctx.appUser.id);
    if (!convo) throw new ApiError('not_found', 404);

    const message = await sendMessage(admin, ctx.appUser.id, convo, body);
    emitServer(event('dm_sent', {}), { distinctId: ctx.appUser.id, userId: ctx.appUser.id });
    return apiOk({ message: toMessageView(message, ctx.appUser.id) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
