import { ApiError, apiNotice, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { DM_REQUEST_LIMIT_PER_DAY, DM_REQUEST_WINDOW_SECONDS } from '@/lib/dm/constants';
import { countDmRequestsToday, startConversation } from '@/lib/dm/service';
import { checkCodsiOffer } from '@/lib/plaza/codsi';
import { offerCreateSchema } from '@/lib/plaza/schemas';
import { loadPostForViewer, parsePostId } from '@/lib/posts-api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * "Waan caawin karaa" (P1 Codsi detail): the offer IS a private DM to the
 * asker — it produces no public artifact and no public count (HANDOFF
 * acceptance). Alongside the Fariimo request we record a post_offers row
 * (visible only to asker + offerer under RLS) so the asker can accept a
 * CONCRETE offer, which is what names the helper on the post.
 *
 * The DM side reuses the whole Fariimo state machine (blocks, dm_privacy,
 * request/accept/reopen, §26 notification + email) via startConversation —
 * and therefore also its §26 throttle: an offer spends one of the day's five
 * DM requests, so the offer button can't out-harass the DM composer.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);
    const input = offerCreateSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const post = await loadPostForViewer(ctx, id);
    const verdict = checkCodsiOffer(post, ctx.appUser.id);
    if (!verdict.ok) throw new ApiError(verdict.code, verdict.status);

    await enforceRateLimit(`dm_req:${ctx.appUser.id}`, {
      max: DM_REQUEST_LIMIT_PER_DAY,
      windowSeconds: DM_REQUEST_WINDOW_SECONDS,
    });
    if ((await countDmRequestsToday(admin, ctx.appUser.id)) >= DM_REQUEST_LIMIT_PER_DAY) {
      throw new ApiError('rate_limited', 429);
    }

    const result = await startConversation(admin, ctx.appUser.id, post.author_user_id, input.message);

    // Record (or refresh) the private offer row. Offering twice is idempotent
    // — the unique (post_id, helper) pair keeps one seat per member.
    const { data: offer, error } = await admin
      .from('post_offers')
      .upsert(
        { post_id: id, helper_user_id: ctx.appUser.id, conversation_id: result.conversation.id },
        { onConflict: 'post_id,helper_user_id' },
      )
      .select('id, accepted_at')
      .single();
    if (error || !offer) throw new Error(`offer upsert failed: ${error?.message ?? 'no row'}`);

    emitServer(event('ask_offer_sent', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    const payload = {
      offerId: offer.id,
      conversationId: result.conversation.id,
      state: result.state,
    };
    // §27: a fresh Fariimo request carries the "request sent" notice; an
    // already-accepted thread just opens.
    if (result.state === 'requested' || result.state === 'reopened') {
      return apiNotice('dm_request_sent', payload);
    }
    return apiOk(payload);
  } catch (error) {
    return handleApiError(error);
  }
}
