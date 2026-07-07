import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Post reactions (§15 five-type set). Idempotent toggle in the follows-route
 * style: reacting twice is a success, unreacting what isn't there is a
 * success.
 *
 * Writes go through the CALLER's RLS client — reactions have real client
 * policies (own rows only; with-check requires the target post to be
 * published + global), so the database is the authz here. No notifications
 * in Phase 2 (§22 bundled notifications are Phase 3).
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
      post_id: params.id,
      type: params.type,
    });

    if (error) {
      // 23505 = already reacted with this type → idempotent success.
      if (error.code === '23505') return apiOk({ reacted: true });
      // 42501 = RLS with-check: post missing, not published, or not global.
      if (error.code === '42501') throw new ApiError('not_found', 404);
      throw new Error(`post reaction insert failed: ${error.message}`);
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
      .eq('post_id', params.id)
      .eq('type', params.type);
    if (error) throw new Error(`post reaction delete failed: ${error.message}`);

    return apiOk({ reacted: false });
  } catch (error) {
    return handleApiError(error);
  }
}
