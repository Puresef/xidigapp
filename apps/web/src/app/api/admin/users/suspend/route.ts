import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { applyModAction } from '@/lib/moderation/actions';
import { MOD_ACTION_RATE } from '@/lib/moderation/constants';
import { suspendSchema } from '@/lib/moderation/schemas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Direct mod/admin suspension of a member (§19) — the out-of-band twin of the
 * report-decision suspend path, for cases a mod acts on a user without an
 * originating report. Funnels through applyModAction so the §19 chain holds
 * (users.status flip → immutable mod_actions row → plain-language notify →
 * audit_logs); the users table has no client write grant, hence service role.
 * `mod` role admits mods AND admins (requireRole semantics).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const mod = await requireRole('mod');
    const { userId, action, reason } = suspendSchema.parse(await request.json());

    await enforceRateLimit(`mod_action:${mod.appUser.id}`, MOD_ACTION_RATE);

    await applyModAction(getSupabaseAdmin(), {
      actorUserId: mod.appUser.id,
      action: action === 'suspend' ? 'suspend_user' : 'unsuspend_user',
      targetType: 'user',
      targetId: userId,
      reason,
    });

    return apiOk({ userId, action });
  } catch (error) {
    return handleApiError(error);
  }
}
