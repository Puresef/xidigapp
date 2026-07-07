import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { blockUser, unblockUser } from '@/lib/dm/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Block / unblock a member (§13 block inside DMs; also usable from a profile).
 * Both idempotent. Blocking halts any live conversation (service side effect),
 * so it is API-only. A blocked member cannot start or send DMs — enforced in
 * the DM service's block checks, not just the UI.
 */

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function PUT(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new ApiError('not_found', 404);
    if (parsed.data.userId === ctx.appUser.id) throw new ApiError('invalid_request', 400);

    await blockUser(getSupabaseAdmin(), ctx.appUser.id, parsed.data.userId);
    return apiOk({ blocked: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new ApiError('not_found', 404);

    await unblockUser(getSupabaseAdmin(), ctx.appUser.id, parsed.data.userId);
    return apiOk({ blocked: false });
  } catch (error) {
    return handleApiError(error);
  }
}
