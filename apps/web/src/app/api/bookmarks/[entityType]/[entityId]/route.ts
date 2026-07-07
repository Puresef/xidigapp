import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rate-limit';
import { BOOKMARK_ENTITY_TYPES, entityReadable } from '@/lib/social/entities';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Save / unsave (Phase 4.5 §1f Saved). Same contract as follows: PUT and
 * DELETE are both idempotent — saving twice or unsaving what isn't saved is a
 * success, never an error. Writes go through the service role (bookmarks is
 * API-only at the DB layer); the existence + readability check runs under the
 * CALLER's RLS first, so private ids can't be probed.
 */

const paramsSchema = z.object({
  entityType: z.enum(BOOKMARK_ENTITY_TYPES),
  entityId: z.string().uuid(),
});

type BookmarkParams = z.infer<typeof paramsSchema>;

function parseParams(raw: { entityType: string; entityId: string }): BookmarkParams {
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

type RouteContext = { params: Promise<{ entityType: string; entityId: string }> };

export async function PUT(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const target = parseParams(await context.params);

    await enforceRateLimit(`bookmarks:${ctx.appUser.id}`, { max: 120, windowSeconds: 3600 });

    if (!(await entityReadable(ctx, target.entityType, target.entityId))) {
      throw new ApiError('not_found', 404);
    }

    const { error } = await getSupabaseAdmin().from('bookmarks').insert({
      user_id: ctx.appUser.id,
      entity_type: target.entityType,
      entity_id: target.entityId,
    });
    if (error) {
      // 23505 = already saved → idempotent success.
      if (error.code === '23505') return apiOk({ bookmarked: true });
      throw new Error(`bookmark insert failed: ${error.message}`);
    }

    emitServer(event('bookmark_added', { entity_type: target.entityType }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ bookmarked: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const target = parseParams(await context.params);

    const { data, error } = await getSupabaseAdmin()
      .from('bookmarks')
      .delete()
      .eq('user_id', ctx.appUser.id)
      .eq('entity_type', target.entityType)
      .eq('entity_id', target.entityId)
      .select('entity_id');
    if (error) throw new Error(`bookmark delete failed: ${error.message}`);

    if ((data ?? []).length > 0) {
      emitServer(event('bookmark_removed', { entity_type: target.entityType }), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    }

    return apiOk({ bookmarked: false });
  } catch (error) {
    return handleApiError(error);
  }
}
