import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Low-bandwidth preference (§22). The cookie (set client-side) drives
 * rendering; this column write gives signed-in members cross-device
 * continuity. RLS: users_update_own with a column grant that includes
 * low_bandwidth_enabled — runs under the caller's own row only.
 */

const bodySchema = z.object({ enabled: z.boolean() });

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { enabled } = bodySchema.parse(await request.json().catch(() => ({})));

    const { error } = await ctx.supabase
      .from('users')
      .update({ low_bandwidth_enabled: enabled })
      .eq('id', ctx.appUser.id);
    if (error) throw new Error(`bandwidth preference update failed: ${error.message}`);

    return apiOk({ lowBandwidthEnabled: enabled });
  } catch (error) {
    return handleApiError(error);
  }
}
