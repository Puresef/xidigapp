import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rate-limit';
import { entityReadable, MUTE_ENTITY_TYPES } from '@/lib/social/entities';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mute / unmute a user, tag, or Space (Phase 4.5 §1f). A mute is a private,
 * viewer-side feed filter (lib/plaza/views.ts) — it never notifies the target
 * and never blocks DMs (that's user_blocks). PUT/DELETE are idempotent like
 * follows and bookmarks. Writes via service role (mutes is API-only).
 */

const paramsSchema = z.object({
  entityType: z.enum(MUTE_ENTITY_TYPES),
  entityId: z.string().uuid(),
});

type MuteParams = z.infer<typeof paramsSchema>;

function parseParams(raw: { entityType: string; entityId: string }): MuteParams {
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

type RouteContext = { params: Promise<{ entityType: string; entityId: string }> };

export async function PUT(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const target = parseParams(await context.params);

    await enforceRateLimit(`mutes:${ctx.appUser.id}`, { max: 60, windowSeconds: 3600 });

    // Muting yourself would silently empty your own feed — refuse.
    if (target.entityType === 'user' && target.entityId === ctx.appUser.id) {
      throw new ApiError('invalid_request', 400);
    }
    if (!(await entityReadable(ctx, target.entityType, target.entityId))) {
      throw new ApiError('not_found', 404);
    }

    const { error } = await getSupabaseAdmin().from('mutes').insert({
      user_id: ctx.appUser.id,
      entity_type: target.entityType,
      entity_id: target.entityId,
    });
    if (error) {
      // 23505 = already muted → idempotent success.
      if (error.code === '23505') return apiOk({ muted: true });
      throw new Error(`mute insert failed: ${error.message}`);
    }

    emitServer(event('mute_added', { entity_type: target.entityType }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ muted: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const target = parseParams(await context.params);

    const { error } = await getSupabaseAdmin()
      .from('mutes')
      .delete()
      .eq('user_id', ctx.appUser.id)
      .eq('entity_type', target.entityType)
      .eq('entity_id', target.entityId);
    if (error) throw new Error(`unmute failed: ${error.message}`);

    return apiOk({ muted: false });
  } catch (error) {
    return handleApiError(error);
  }
}
