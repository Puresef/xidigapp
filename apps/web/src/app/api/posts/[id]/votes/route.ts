import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { voteSchema } from '@/lib/plaza/schemas';
import { hydrateOnePost, loadPostForViewer, parsePostId } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Poll voting (Seq 14): single-select, recast allowed until close, ballots
 * anonymous. The vote is an upsert under the CALLER's RLS — the with-check
 * policy is the enforcement (poll open, post published + global, deadline not
 * passed), so a denial arrives as 42501 → poll_closed rather than a
 * hand-rolled state check that could drift from the database's.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);
    const input = voteSchema.parse(await request.json());

    const post = await loadPostForViewer(ctx, id);

    // NOT an upsert: PostgREST upserts compile to ON CONFLICT DO UPDATE SET
    // over every provided column, which needs UPDATE privilege on post_id /
    // voter_user_id — deliberately revoked (only poll_option_id is
    // recastable). Insert first; a 23505 on (post_id, voter_user_id) means
    // this member already voted → recast via a narrow poll_option_id update.
    const { error } = await ctx.supabase.from('poll_votes').insert({
      post_id: id,
      poll_option_id: input.optionId,
      voter_user_id: ctx.appUser.id,
    });
    if (error && error.code === '23505') {
      const { error: recastError } = await ctx.supabase
        .from('poll_votes')
        .update({ poll_option_id: input.optionId })
        .eq('post_id', id)
        .eq('voter_user_id', ctx.appUser.id);
      if (recastError) {
        // 42501 = RLS with-check said no: poll closed / past deadline.
        if (recastError.code === '42501') throw new ApiError('poll_closed', 409);
        // 23503 = composite FK: the option doesn't belong to this poll.
        if (recastError.code === '23503') throw new ApiError('invalid_request', 400);
        throw new Error(`vote recast failed: ${recastError.message}`);
      }
    } else if (error) {
      // 42501 = RLS with-check said no: poll closed / past deadline / not votable.
      if (error.code === '42501') throw new ApiError('poll_closed', 409);
      // 23503 = option FK: the option doesn't belong to this poll.
      if (error.code === '23503') throw new ApiError('invalid_request', 400);
      throw new Error(`vote insert failed: ${error.message}`);
    }

    // Fresh tallies (hydration counts poll_votes live, so this includes the
    // ballot just cast).
    const view = await hydrateOnePost(getSupabaseAdmin(), ctx.appUser.id, post);
    if (!view.poll) throw new Error(`post ${id} accepted a vote but hydrated no poll`);

    return apiOk({ poll: view.poll });
  } catch (error) {
    return handleApiError(error);
  }
}
