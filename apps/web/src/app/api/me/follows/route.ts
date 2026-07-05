import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * The caller's own follow edges (RLS: follows_select_own) — the data behind
 * the Home "Following" feed tab (§13). Optionally filtered by target type.
 */

const querySchema = z.object({
  targetType: z.enum(['user', 'lab', 'candidate', 'tag']).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { targetType } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    let query = ctx.supabase
      .from('follows')
      .select('target_type, target_id, created_at')
      .eq('follower_user_id', ctx.appUser.id)
      .order('created_at', { ascending: false });

    if (targetType) query = query.eq('target_type', targetType);

    const { data, error } = await query;
    if (error) throw new Error(`follows query failed: ${error.message}`);

    return apiOk({ follows: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
