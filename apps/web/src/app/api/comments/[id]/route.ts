import { after } from 'next/server';
import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { commentUpdateSchema } from '@/lib/plaza/schemas';
import { COMMENT_COLUMNS, hydrateComments, type CommentRow } from '@/lib/plaza/views';
import { scanTextContent } from '@/lib/moderation/scan';

/**
 * Own-comment management (§15). PATCH edits the body (sets edited_at,
 * re-scans); DELETE is a soft delete → status 'removed'.
 *
 * The load goes through the CALLER's RLS client — a comment the caller can't
 * see is a plain 404, and authors can still edit their own hidden
 * (under-review) comments. Writes go through the service role after the
 * author check (comments have no client write policies by design).
 */

const paramsSchema = z.object({ id: z.string().uuid() });

function parseCommentId(raw: { id: string }): string {
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data.id;
}

/** RLS load + author gate shared by PATCH and DELETE. */
async function loadOwnComment(ctx: AuthContext, commentId: string): Promise<CommentRow> {
  const { data, error } = await ctx.supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('id', commentId)
    .maybeSingle();
  if (error) throw new Error(`comment load failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);

  const comment = data as unknown as CommentRow;
  if (comment.author_user_id !== ctx.appUser.id) throw new ApiError('forbidden', 403);
  return comment;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const commentId = parseCommentId(await context.params);
    const input = commentUpdateSchema.parse(await request.json());

    const existing = await loadOwnComment(ctx, commentId);
    if (existing.status === 'removed') throw new ApiError('post_not_editable', 403);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('comments')
      .update({ body: input.body, edited_at: new Date().toISOString() })
      .eq('id', commentId)
      .select(COMMENT_COLUMNS)
      .single();
    if (error) throw new Error(`comment update failed: ${error.message}`);

    const row = data as unknown as CommentRow;

    // Edited text goes back through the §15 pre-scan pipeline.
    after(() =>
      scanTextContent(admin, {
        entityType: 'comment',
        entityId: row.id,
        authorUserId: ctx.appUser.id,
        text: input.body,
      }),
    );

    const [comment] = await hydrateComments(admin, ctx.appUser.id, [row]);
    if (!comment) throw new Error('comment hydration returned no view');

    return apiOk({ comment });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const commentId = parseCommentId(await context.params);

    await loadOwnComment(ctx, commentId);

    // Soft delete. If this was the credited answer, the credit flag stands —
    // the history is real (§14 anti-gaming recomputation is Phase 7's job).
    const { error } = await getSupabaseAdmin()
      .from('comments')
      .update({ status: 'removed' })
      .eq('id', commentId);
    if (error) throw new Error(`comment delete failed: ${error.message}`);

    return apiOk({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
