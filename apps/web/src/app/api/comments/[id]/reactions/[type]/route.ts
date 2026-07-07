import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Comment reactions (§15 five-type set) — the comment twin of
 * /api/posts/[id]/reactions/[type]. Idempotent both ways.
 *
 * Writes go through the CALLER's RLS client: the reactions insert policy's
 * with-check requires a published comment on a published, global post, so a
 * 42501 here simply means "no such reactable comment" → 404. No
 * notifications in Phase 2 (bundling is Phase 3).
 */

const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['fire', 'strong', 'mashallah', 'idea', 'watching']),
});

type ReactionParams = z.infer<typeof paramsSchema>;

function parseParams(raw: { id: string; type: string }): ReactionParams {
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

export async function PUT(
  _request: Request,
  context: { params: Promise<{ id: string; type: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = parseParams(await context.params);

    const { error } = await ctx.supabase.from('reactions').insert({
      user_id: ctx.appUser.id,
      comment_id: params.id,
      type: params.type,
    });

    if (error) {
      // 23505 = already reacted with this type → idempotent success.
      if (error.code === '23505') return apiOk({ reacted: true });
      // 42501 = RLS with-check: comment missing, hidden/removed, or its post
      // isn't published + global.
      if (error.code === '42501') throw new ApiError('not_found', 404);
      throw new Error(`comment reaction insert failed: ${error.message}`);
    }

    return apiOk({ reacted: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; type: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = parseParams(await context.params);

    const { error } = await ctx.supabase
      .from('reactions')
      .delete()
      .eq('user_id', ctx.appUser.id)
      .eq('comment_id', params.id)
      .eq('type', params.type);
    if (error) throw new Error(`comment reaction delete failed: ${error.message}`);

    return apiOk({ reacted: false });
  } catch (error) {
    return handleApiError(error);
  }
}
