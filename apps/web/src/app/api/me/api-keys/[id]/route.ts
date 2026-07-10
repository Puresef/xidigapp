import { z } from 'zod';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { revokeApiKey } from '@/lib/api-keys/keys';
import { requireUser } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Revoke an API key (PRD §21). A member revokes their OWN keys; an admin may
 * revoke any key (operational kill-switch). Idempotent — revoking an already
 * revoked or non-existent (to this caller) key returns 404, never leaks whether
 * a key exists for someone else.
 */
export const runtime = 'nodejs';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { id } = paramsSchema.parse(await params);
    const admin = getSupabaseAdmin();

    // Members are scoped to their own keys; admins may revoke any.
    const ownerScope = ctx.appUser.role === 'admin' ? undefined : ctx.appUser.id;
    const revoked = await revokeApiKey(admin, { keyId: id, ownerUserId: ownerScope });
    if (!revoked) throw new ApiError('not_found', 404);

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'api_key.revoked',
      targetType: 'api_key',
      targetId: id,
    });
    emitServer(event('external_api_key_revoked', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ revoked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
