import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { POST_COLUMNS } from '@/lib/plaza/views';
import { hydrateOnePost, loadPostForViewer, parsePostId } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Author early close (Seq 14: "early close allowed"). Deadline-driven closes
 * are the plaza cron's job; this is the author deciding the poll is done.
 */

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);
    const admin = getSupabaseAdmin();

    const post = await loadPostForViewer(ctx, id);
    if (post.type !== 'poll') throw new ApiError('invalid_request', 400);
    if (post.author_user_id !== ctx.appUser.id) throw new ApiError('forbidden', 403);
    if (post.poll_status !== 'open') throw new ApiError('poll_closed', 409);

    const { data: updated, error } = await admin
      .from('posts')
      .update({ poll_status: 'closed' })
      .eq('id', id)
      .select(POST_COLUMNS)
      .single();
    if (error || !updated) {
      throw new Error(`poll close failed: ${error?.message ?? 'no row returned'}`);
    }

    const view = await hydrateOnePost(admin, ctx.appUser.id, updated);
    return apiOk({ post: view });
  } catch (error) {
    return handleApiError(error);
  }
}
