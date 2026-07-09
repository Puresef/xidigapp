import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { insertNotification } from '@/lib/plaza/notify';
import { askActionSchema } from '@/lib/plaza/schemas';
import { hydrateOnePost, loadPostForViewer, parsePostId } from '@/lib/posts-api';
import { BADGE_SLUGS, TOP_HELPER_THRESHOLD } from '@/lib/reputation/constants';
import { awardBadge, awardReputation, getHelperScore } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

/**
 * Ask lifecycle (§15): the asker credits one answer (open → answered) or
 * closes the thread (open|answered → closed). Crediting pays the helper —
 * a Helper-score credit (via the §14 anti-gaming engine) + notification.
 *
 * One credited answer per post is enforced by the DB's unique partial index;
 * a lost race surfaces as 23505 → ask_already_answered.
 */

/**
 * Helper payout, best-effort after the credit committed: a ledger hiccup must
 * not 500 a credit that already happened (audit/notify precedent). award_
 * reputation() applies the §14 rules (30 pt/day cap, no AI Helper score,
 * idempotent per comment); crossing the Top Helper threshold grants that badge
 * once. self-credit is already refused upstream (helper != asker).
 */
async function payHelperCredit(
  admin: SupabaseClient<Database>,
  helperUserId: string,
  commentId: string,
): Promise<void> {
  const awarded = await awardReputation(admin, {
    userId: helperUserId,
    eventType: 'ask_credited',
    entityType: 'comment',
    entityId: commentId,
  });
  if (awarded > 0 && (await getHelperScore(admin, helperUserId)) >= TOP_HELPER_THRESHOLD) {
    await awardBadge(admin, { userId: helperUserId, slug: BADGE_SLUGS.topHelper });
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
    if (post.type !== 'ask') throw new ApiError('invalid_request', 400);
    if (post.author_user_id !== ctx.appUser.id) throw new ApiError('forbidden', 403);

    if (input.action === 'credit') {
      if (post.ask_status === 'answered') throw new ApiError('ask_already_answered', 409);
      if (post.ask_status !== 'open') throw new ApiError('ask_not_open', 409);

      const { data: comment, error: commentError } = await admin
        .from('comments')
        .select('id, post_id, author_user_id, status')
        .eq('id', input.commentId)
        .maybeSingle();
      if (commentError) throw new Error(`comment lookup failed: ${commentError.message}`);
      const creditable =
        comment &&
        comment.post_id === id &&
        comment.status === 'published' &&
        comment.author_user_id !== ctx.appUser.id;
      if (!creditable) throw new ApiError('ask_credit_invalid', 400);

      const { error: creditError } = await admin
        .from('comments')
        .update({ is_credited_answer: true })
        .eq('id', comment.id);
      if (creditError) {
        // 23505 = the one-credit-per-post partial unique lost a race.
        if (creditError.code === '23505') throw new ApiError('ask_already_answered', 409);
        throw new Error(`credit update failed: ${creditError.message}`);
      }

      const { error: statusError } = await admin
        .from('posts')
        .update({ ask_status: 'answered' })
        .eq('id', id);
      if (statusError) throw new Error(`ask status update failed: ${statusError.message}`);

      await payHelperCredit(admin, comment.author_user_id, comment.id);
      await insertNotification(admin, {
        userId: comment.author_user_id,
        actorUserId: ctx.appUser.id,
        type: 'ask_credited',
        entityType: 'post',
        entityId: id,
      });
      emitServer(event('ask_resolved', { credited: true }), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
      // §20/§23 mentor_ask_answered: if the credited helper is the current
      // Mentor-in-Residence, their commitment counter ticks. Subject = the
      // mentor (the answerer). Best-effort, consent-gated.
      const today = new Date().toISOString().slice(0, 10);
      const { data: mentor } = await admin
        .from('mentor_residencies')
        .select('id')
        .eq('advisor_user_id', comment.author_user_id)
        .lte('starts_on', today)
        .gte('ends_on', today)
        .limit(1)
        .maybeSingle();
      if (mentor) {
        emitServer(event('mentor_ask_answered', {}), {
          distinctId: comment.author_user_id,
          userId: comment.author_user_id,
        });
      }
    } else {
      if (post.ask_status !== 'open' && post.ask_status !== 'answered') {
        throw new ApiError('ask_not_open', 409);
      }
      const { error } = await admin.from('posts').update({ ask_status: 'closed' }).eq('id', id);
      if (error) throw new Error(`ask close failed: ${error.message}`);
      emitServer(event('ask_resolved', { credited: false }), {
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
