import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mark notifications read. Either a specific set of ids (a bundle the user
 * opened) or all unread. Always scoped to the caller's own rows — service role
 * bypasses RLS, so the user_id filter is the guard. API-only (writes revoked
 * for clients; bundling semantics are an API concern).
 */

const readSchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = readSchema.parse(await request.json().catch(() => ({})));

    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();
    let q = admin
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', ctx.appUser.id)
      .is('read_at', null);
    if (!input.all && input.ids && input.ids.length > 0) {
      q = q.in('id', input.ids);
    }

    const { error } = await q;
    if (error) throw new Error(`mark-read failed: ${error.message}`);

    return apiOk({ readAt: now });
  } catch (error) {
    return handleApiError(error);
  }
}
