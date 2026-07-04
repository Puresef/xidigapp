import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Beta gating toggle (§9: invite-only vs open waitlist). Admin-only,
 * API-first, audited — the §19 immutable trail records every flip.
 */

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const { data: mode } = await ctx.supabase.rpc('get_signup_mode');
    return apiOk({ signupMode: mode ?? 'invite_only' });
  } catch (error) {
    return handleApiError(error);
  }
}

const bodySchema = z.object({
  signupMode: z.enum(['invite_only', 'waitlist']),
});

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const body = bodySchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    const { data: previous } = await admin.rpc('get_signup_mode');

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: 'signup_mode', value: body.signupMode });
    if (error) throw new Error(`signup_mode update failed: ${error.message}`);

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'settings.signup_mode.update',
      metadata: { from: previous, to: body.signupMode },
    });

    return apiOk({ signupMode: body.signupMode });
  } catch (error) {
    return handleApiError(error);
  }
}
