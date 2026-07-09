import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiNotice, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  DM_INBOX_PAGE_SIZE,
  DM_REQUEST_LIMIT_PER_DAY,
  DM_REQUEST_WINDOW_SECONDS,
} from '@/lib/dm/constants';
import { startConversation, countDmRequestsToday } from '@/lib/dm/service';
import { startConversationSchema } from '@/lib/dm/schemas';
import { hydrateInbox } from '@/lib/dm/views';
import { decodeCursor, encodeCursor } from '@/lib/pagination';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Fariimo conversations (§13 DMs).
 *
 *   GET  — the inbox: the caller's conversations with last-message preview,
 *          per-conversation unread count and the other participant, newest
 *          activity first (dm_inbox() RPC, RLS-scoped). Keyset by updated_at.
 *   POST — start a request-to-chat (optionally with a first-message preview).
 *          §26 5/day throttle; block + contact-option gates live in the
 *          service. Returns the §27 "request sent" notice.
 */

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const url = new URL(request.url);
    const cursor = decodeCursor(url.searchParams.get('cursor')); // { createdAt: updated_at, id }

    const { data, error } = await ctx.supabase.rpc(
      'dm_inbox',
      cursor
        ? { p_limit: DM_INBOX_PAGE_SIZE, p_before: cursor.createdAt, p_before_id: cursor.id }
        : { p_limit: DM_INBOX_PAGE_SIZE },
    );
    if (error) throw new Error(`inbox failed: ${error.message}`);

    const rows = data ?? [];
    const items = await hydrateInbox(ctx.supabase, rows);
    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length === DM_INBOX_PAGE_SIZE && last
        ? encodeCursor({ createdAt: last.updated_at, id: last.conversation_id })
        : null;

    return apiOk({ conversations: items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = startConversationSchema.parse(await request.json());
    if (input.recipientUserId === ctx.appUser.id) throw new ApiError('invalid_request', 400);

    const admin = getSupabaseAdmin();

    // §26 5 DM requests/day. Upstash edge limit (fail-open) PLUS a durable
    // DB-count backstop so the throttle still bites when Upstash is unset.
    await enforceRateLimit(`dm_req:${ctx.appUser.id}`, {
      max: DM_REQUEST_LIMIT_PER_DAY,
      windowSeconds: DM_REQUEST_WINDOW_SECONDS,
    });
    if ((await countDmRequestsToday(admin, ctx.appUser.id)) >= DM_REQUEST_LIMIT_PER_DAY) {
      throw new ApiError('rate_limited', 429);
    }

    const result = await startConversation(
      admin,
      ctx.appUser.id,
      input.recipientUserId,
      input.message,
    );

    const payload = {
      conversationId: result.conversation.id,
      status: result.conversation.status,
      state: result.state,
    };

    // §27: a freshly sent / re-opened request returns the "message request has
    // been sent" notice; opening an existing/accepted thread is a plain OK.
    if (result.state === 'requested' || result.state === 'reopened') {
      emitServer(event('dm_request_sent', {}), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
      return apiNotice('dm_request_sent', payload);
    }
    return apiOk(payload);
  } catch (error) {
    return handleApiError(error);
  }
}
