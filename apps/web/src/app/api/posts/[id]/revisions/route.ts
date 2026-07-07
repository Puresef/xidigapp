import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { isModOrAdmin, loadPostForViewer, parsePostId } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Edit history of a post (Phase 4.5 §1f). Author-or-mod only — revisions can
 * contain content the author already thought better of, so they are NOT
 * member-visible (mirrors the post_revisions RLS policy). Newest first; a
 * revision row is the snapshot of the post BEFORE that edit was applied.
 */

const REVISIONS_PAGE_CAP = 50;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);

    const post = await loadPostForViewer(ctx, id);
    if (post.author_user_id !== ctx.appUser.id && !isModOrAdmin(ctx)) {
      throw new ApiError('forbidden', 403);
    }

    const { data, error } = await getSupabaseAdmin()
      .from('post_revisions')
      .select('id, post_id, editor_user_id, previous_title, previous_body, previous_link_url, had_replies, created_at')
      .eq('post_id', id)
      .order('created_at', { ascending: false })
      .limit(REVISIONS_PAGE_CAP);
    if (error) throw new Error(`revisions query failed: ${error.message}`);

    return apiOk({ items: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
