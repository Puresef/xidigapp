import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * Follow / unfollow (§13 — one-way follow; drives the Home "Following" tab).
 *
 * Phase 1 ships the targets whose tables exist and are readable: people and
 * tags. Labs and Candidates arrive in later phases — following them 404s
 * until then (the enum has the values; the API gates what's live).
 *
 * PUT and DELETE are both idempotent: following twice, or unfollowing what
 * you don't follow, is a success, not an error.
 */

const paramsSchema = z.object({
  targetType: z.enum(['user', 'tag']),
  targetId: z.string().uuid(),
});

type FollowParams = z.infer<typeof paramsSchema>;

async function targetExists(ctx: AuthContext, target: FollowParams): Promise<boolean> {
  if (target.targetType === 'user') {
    const { data } = await ctx.supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', target.targetId)
      .maybeSingle();
    return Boolean(data);
  }
  const { data } = await ctx.supabase
    .from('tags')
    .select('id')
    .eq('id', target.targetId)
    .maybeSingle();
  return Boolean(data);
}

function parseParams(raw: { targetType: string; targetId: string }): FollowParams {
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

export async function PUT(
  _request: Request,
  context: { params: Promise<{ targetType: string; targetId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const target = parseParams(await context.params);

    await enforceRateLimit(`follow:${ctx.appUser.id}`, { max: 120, windowSeconds: 3600 });

    if (!(await targetExists(ctx, target))) throw new ApiError('not_found', 404);

    const { error } = await ctx.supabase.from('follows').insert({
      follower_user_id: ctx.appUser.id,
      target_type: target.targetType,
      target_id: target.targetId,
    });

    if (error) {
      // 23505 = already following → idempotent success.
      if (error.code === '23505') return apiOk({ following: true });
      // 23514 = follows_no_self (can't follow yourself).
      if (error.code === '23514') throw new ApiError('invalid_request', 400);
      throw new Error(`follow failed: ${error.message}`);
    }

    emitServer(event('follow_created', { target_type: target.targetType }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ following: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ targetType: string; targetId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const target = parseParams(await context.params);

    const { error } = await ctx.supabase
      .from('follows')
      .delete()
      .eq('follower_user_id', ctx.appUser.id)
      .eq('target_type', target.targetType)
      .eq('target_id', target.targetId);
    if (error) throw new Error(`unfollow failed: ${error.message}`);

    return apiOk({ following: false });
  } catch (error) {
    return handleApiError(error);
  }
}
