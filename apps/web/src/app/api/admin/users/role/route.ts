import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Role management (§26 RBAC: admin only). Self-demotion is blocked so the
 * last admin can't lock the platform out; role changes land in the §19
 * immutable audit trail.
 */

const bodySchema = z.object({
  userId: z.uuid(),
  role: z.enum(['member', 'mod', 'admin']),
});

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const body = bodySchema.parse(await request.json());

    if (body.userId === ctx.appUser.id) throw new ApiError('invalid_request', 400);

    const admin = getSupabaseAdmin();
    const { data: target } = await admin
      .from('users')
      .select('id, role')
      .eq('id', body.userId)
      .maybeSingle();
    if (!target) throw new ApiError('not_found', 404);

    if (target.role !== body.role) {
      const { error } = await admin
        .from('users')
        .update({ role: body.role })
        .eq('id', body.userId);
      if (error) throw new Error(`role update failed: ${error.message}`);

      await writeAudit(admin, {
        actorUserId: ctx.appUser.id,
        action: 'user.role.update',
        targetType: 'user',
        targetId: body.userId,
        metadata: { from: target.role, to: body.role },
      });
    }

    return apiOk({ userId: body.userId, role: body.role });
  } catch (error) {
    return handleApiError(error);
  }
}
