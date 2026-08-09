import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { checkCodsiTransition } from '@/lib/plaza/codsi';
import { insertNotification } from '@/lib/plaza/notify';
import { askActionSchema } from '@/lib/plaza/schemas';
import { hydrateOnePost, loadPostForViewer, parsePostId } from '@/lib/posts-api';
import { BADGE_SLUGS, TOP_HELPER_THRESHOLD } from '@/lib/reputation/constants';
import { awardBadge, awardReputation, getHelperScore } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

/**
 * Codsi lifecycle (P1, HANDOFF "Codsi detail" row): open → in_progress →
 * fulfilled, asker-only. accept_offer names the helper publicly ("Waxaa
 * caawinaya …"); fulfill is terminal and pays the §14 helper credit when a
 * helper is named; reopen walks an in-progress ask back and clears the seat.
 *
 * Authz is two-layer by design: posts carry no client write grants (RLS
 * denies everyone), and checkCodsiTransition refuses non-askers before the
 * service role touches the row. "Xidig waxba iskama beddelo" — no system
 * transition exists on this route.
 */

/**
 * Helper payout, best-effort after the fulfil committed: a ledger hiccup must
 * not 500 a transition that already happened (audit/notify precedent).
 * award_reputation() applies the §14 rules (caps, decay, idempotent per
 * post); crossing the Top Helper threshold grants that badge once.
 * Self-help is structurally impossible (posts_ask_helper_not_author).
 */
async function payHelperCredit(
  admin: SupabaseClient<Database>,
  helperUserId: string,
  postId: string,
): Promise<void> {
  const awarded = await awardReputation(admin, {
    userId: helperUserId,
    eventType: 'ask_credited',
    entityType: 'post',
    entityId: postId,
  });
  if (awarded > 0 && (await getHelperScore(admin, helperUserId)) >= TOP_HELPER_THRESHOLD) {
    await awardBadge(admin, { userId: helperUserId, slug: BADGE_SLUGS.topHelper });
  }
}

/** §20/§23 mentor_ask_answered: a fulfilled ask credits the current
 *  Mentor-in-Residence's commitment counter. Best-effort, consent-gated. */
async function tickMentorCounter(
  admin: SupabaseClient<Database>,
  helperUserId: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: mentor } = await admin
    .from('mentor_residencies')
    .select('id')
    .eq('advisor_user_id', helperUserId)
    .lte('starts_on', today)
    .gte('ends_on', today)
    .limit(1)
    .maybeSingle();
  if (mentor) {
    emitServer(event('mentor_ask_answered', {}), {
      distinctId: helperUserId,
      userId: helperUserId,
    });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);
    const input = askActionSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const post = await loadPostForViewer(ctx, id);
    const verdict = checkCodsiTransition(post, ctx.appUser.id, input.action);
    if (!verdict.ok) throw new ApiError(verdict.code, verdict.status);

    if (input.action === 'accept_offer') {
      const { data: offer, error: offerError } = await admin
        .from('post_offers')
        .select('id, post_id, helper_user_id')
        .eq('id', input.offerId)
        .maybeSingle();
      if (offerError) throw new Error(`offer lookup failed: ${offerError.message}`);
      if (!offer || offer.post_id !== id) throw new ApiError('not_found', 404);

      const acceptedAt = new Date().toISOString();
      const { error: statusError } = await admin
        .from('posts')
        .update({
          ask_status: 'in_progress',
          ask_helper_user_id: offer.helper_user_id,
          ask_helped_at: acceptedAt,
        })
        .eq('id', id);
      if (statusError) throw new Error(`offer accept failed: ${statusError.message}`);

      const { error: offerStamp } = await admin
        .from('post_offers')
        .update({ accepted_at: acceptedAt })
        .eq('id', offer.id);
      if (offerStamp) throw new Error(`offer stamp failed: ${offerStamp.message}`);

      // The helper strip is public from this moment — tell the person named.
      await insertNotification(admin, {
        userId: offer.helper_user_id,
        actorUserId: ctx.appUser.id,
        type: 'ask_helper_named',
        entityType: 'post',
        entityId: id,
      });
      emitServer(event('ask_offer_accepted', {}), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    } else if (input.action === 'fulfill') {
      const helperUserId = post.ask_helper_user_id;
      const { error } = await admin
        .from('posts')
        .update({ ask_status: 'fulfilled', ask_fulfilled_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(`ask fulfil failed: ${error.message}`);

      if (helperUserId) {
        await payHelperCredit(admin, helperUserId, id);
        await insertNotification(admin, {
          userId: helperUserId,
          actorUserId: ctx.appUser.id,
          type: 'ask_credited',
          entityType: 'post',
          entityId: id,
        });
        await tickMentorCounter(admin, helperUserId);
      }
      emitServer(event('ask_resolved', { credited: helperUserId !== null }), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    } else {
      // reopen: back to open, seat cleared; standing offers become
      // re-acceptable (their accepted_at stamp is withdrawn with the seat).
      const { error } = await admin
        .from('posts')
        .update({ ask_status: 'open', ask_helper_user_id: null, ask_helped_at: null })
        .eq('id', id);
      if (error) throw new Error(`ask reopen failed: ${error.message}`);

      const { error: offerReset } = await admin
        .from('post_offers')
        .update({ accepted_at: null })
        .eq('post_id', id)
        .not('accepted_at', 'is', null);
      if (offerReset) throw new Error(`offer reset failed: ${offerReset.message}`);

      emitServer(event('ask_reopened', {}), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    }

    const fresh = await loadPostForViewer(ctx, id);
    const view = await hydrateOnePost(admin, ctx.appUser.id, fresh);
    return apiOk({ post: view });
  } catch (error) {
    return handleApiError(error);
  }
}
