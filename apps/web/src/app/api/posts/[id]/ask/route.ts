import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { HELPER_CREDIT_EVENT_TYPE, HELPER_CREDIT_POINTS } from '@/lib/plaza/constants';
import { insertNotification } from '@/lib/plaza/notify';
import { askActionSchema } from '@/lib/plaza/schemas';
import { hydrateOnePost, loadPostForViewer, parsePostId } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

/**
 * Ask lifecycle (§15): the asker credits one answer (open → answered) or
 * closes the thread (open|answered → closed). Crediting pays the helper —
 * a reputation_events ledger row + helper_score increment + notification.
 *
 * One credited answer per post is enforced by the DB's unique partial index;
 * a lost race surfaces as 23505 → ask_already_answered.
 */

/**
 * Helper payout, best-effort after the credit committed: a ledger hiccup must
 * not 500 a credit that already happened (audit/notify precedent) — but it is
 * loud, because reputation_events is what Phase 7 recomputes scores from.
 */
async function payHelperCredit(
  admin: SupabaseClient<Database>,
  helperUserId: string,
  commentId: string,
): Promise<void> {
  const { error: eventError } = await admin.from('reputation_events').insert({
    user_id: helperUserId,
    event_type: HELPER_CREDIT_EVENT_TYPE,
    points: HELPER_CREDIT_POINTS,
    entity_type: 'comment',
    entity_id: commentId,
  });
  if (eventError) {
    console.error('[ask] reputation event insert failed:', eventError.message);
  }

  // Fetch-then-upsert increment. Racy in theory, but a post credits exactly
  // once, so two concurrent increments for the same credit can't happen.
  const { data: score } = await admin
    .from('reputation_scores')
    .select('helper_score')
    .eq('user_id', helperUserId)
    .maybeSingle();
  const { error: scoreError } = await admin.from('reputation_scores').upsert(
    {
      user_id: helperUserId,
      helper_score: (score?.helper_score ?? 0) + HELPER_CREDIT_POINTS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (scoreError) {
    console.error('[ask] helper score upsert failed:', scoreError.message);
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
    } else {
      if (post.ask_status !== 'open' && post.ask_status !== 'answered') {
        throw new ApiError('ask_not_open', 409);
      }
      const { error } = await admin.from('posts').update({ ask_status: 'closed' }).eq('id', id);
      if (error) throw new Error(`ask close failed: ${error.message}`);
    }

    const fresh = await loadPostForViewer(ctx, id);
    const view = await hydrateOnePost(admin, ctx.appUser.id, fresh);
    return apiOk({ post: view });
  } catch (error) {
    return handleApiError(error);
  }
}
