import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { apiOk, handleApiError } from '@/lib/api';
import { INVITES_PER_DAY } from '@/lib/auth/constants';
import { requireUser } from '@/lib/auth/guards';
import { generateInviteCode } from '@/lib/auth/invites';
import { writeAudit } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Member invites (§20: invite system — codes + tracked referrals).
 * GET  — own invites with redemption state (RLS: creator or redeemer).
 * POST — mint a new single-use code (rate-limited per member per day;
 *        creation is service-side so RLS never allows direct inserts).
 */

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { data: invites, error } = await ctx.supabase
      .from('invites')
      .select('id, code, created_at, redeemed_at, redeemed_by_user_id, expires_at, revoked_at')
      .eq('created_by_user_id', ctx.appUser.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return apiOk({ invites: invites ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(): Promise<Response> {
  try {
    const ctx = await requireUser();
    await enforceRateLimit(`invites:${ctx.appUser.id}`, {
      max: INVITES_PER_DAY,
      windowSeconds: 86400,
    });

    const admin = getSupabaseAdmin();
    const code = generateInviteCode();

    const { data: invite, error } = await admin
      .from('invites')
      .insert({ code, created_by_user_id: ctx.appUser.id })
      .select('id, code, created_at')
      .single();
    if (error) throw new Error(`invite insert failed: ${error.message}`);

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'invite.created',
      targetType: 'invite',
      targetId: invite.id,
    });

    emitServer(event('invite_sent', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ invite }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
