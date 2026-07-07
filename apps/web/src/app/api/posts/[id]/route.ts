import { after } from 'next/server';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { scanTextContent } from '@/lib/moderation/scan';
import { postUpdateSchema } from '@/lib/plaza/schemas';
import { POST_COLUMNS } from '@/lib/plaza/views';
import { hydrateOnePost, loadPostForViewer, parsePostId, postScanText } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { TablesUpdate } from '@xidig/db';

/**
 * Single Plaza post (§15). Reads run under the caller's RLS, so authors see
 * their own hidden/removed posts (with the client-side status banner) and
 * mods see everything — anyone else gets a 404.
 *
 * PATCH is author-only content editing (title/body/link — never type, images
 * or poll shape in v1) and re-runs the AI text pre-scan on the new text.
 * DELETE is the author's soft-delete → status 'removed'.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);
    const admin = getSupabaseAdmin();

    const post = await loadPostForViewer(ctx, id);
    const view = await hydrateOnePost(admin, ctx.appUser.id, post);

    // Asker UX: which comment holds the credit (unique partial index — ≤1).
    const { data: credited, error } = await admin
      .from('comments')
      .select('id')
      .eq('post_id', id)
      .eq('is_credited_answer', true)
      .maybeSingle();
    if (error) throw new Error(`credited comment lookup failed: ${error.message}`);

    return apiOk({ post: view, creditedCommentId: credited?.id ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);
    const input = postUpdateSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const post = await loadPostForViewer(ctx, id);
    if (post.author_user_id !== ctx.appUser.id) throw new ApiError('forbidden', 403);
    if (post.status === 'removed') throw new ApiError('post_not_editable', 403);

    // Edit history (Phase 4.5): snapshot the pre-edit content BEFORE applying
    // anything — if the snapshot can't be written, the edit doesn't happen.
    // had_replies is the §13 trust signal ("edited after people answered").
    const { data: firstReply, error: replyError } = await admin
      .from('comments')
      .select('id')
      .eq('post_id', id)
      .eq('status', 'published')
      .limit(1);
    if (replyError) throw new Error(`reply existence check failed: ${replyError.message}`);

    const { error: revisionError } = await admin.from('post_revisions').insert({
      post_id: id,
      editor_user_id: ctx.appUser.id,
      previous_title: post.title,
      previous_body: post.body,
      previous_link_url: post.link_url,
      had_replies: (firstReply ?? []).length > 0,
    });
    if (revisionError) throw new Error(`revision snapshot failed: ${revisionError.message}`);

    const patch: TablesUpdate<'posts'> = { edited_at: new Date().toISOString() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.body !== undefined) patch.body = input.body;
    if (input.linkUrl !== undefined) patch.link_url = input.linkUrl;

    const { data: updated, error } = await admin
      .from('posts')
      .update(patch)
      .eq('id', id)
      .select(POST_COLUMNS)
      .single();
    if (error || !updated) {
      throw new Error(`post update failed: ${error?.message ?? 'no row returned'}`);
    }

    after(() =>
      scanTextContent(admin, {
        entityType: 'post',
        entityId: id,
        authorUserId: ctx.appUser.id,
        text: postScanText(updated.title, updated.body),
      }),
    );

    emitServer(event('post_edited', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    const view = await hydrateOnePost(admin, ctx.appUser.id, updated);
    return apiOk({ post: view });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);

    const post = await loadPostForViewer(ctx, id);
    if (post.author_user_id !== ctx.appUser.id) throw new ApiError('forbidden', 403);

    const { error } = await getSupabaseAdmin()
      .from('posts')
      .update({ status: 'removed' })
      .eq('id', id);
    if (error) throw new Error(`post delete failed: ${error.message}`);

    return apiOk({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
