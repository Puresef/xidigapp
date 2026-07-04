import { z } from 'zod';

import { env } from '@/env';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { generateInviteCode } from '@/lib/auth/invites';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getEmailProvider } from '@/lib/email/provider';
import { inviteEmail } from '@/lib/email/templates';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Invite someone off the waitlist (§20): mints a single-use code, marks the
 * entry invited, emails the code (email entries — phone entries surface the
 * code to the admin for manual sending until an SMS template ships).
 * Idempotent: re-inviting resends the existing open code.
 */

const bodySchema = z.object({ entryId: z.uuid() });

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireRole('admin');
    const body = bodySchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    const { data: entry } = await admin
      .from('waitlist_entries')
      .select('id, email, phone, status, invite_id')
      .eq('id', body.entryId)
      .maybeSingle();

    if (!entry) throw new ApiError('not_found', 404);
    if (entry.status === 'joined') throw new ApiError('invalid_request', 400);

    // Reuse the open invite on re-send; mint otherwise.
    let code: string | null = null;
    let inviteId = entry.invite_id;
    if (inviteId) {
      const { data: existing } = await admin
        .from('invites')
        .select('id, code, redeemed_at, revoked_at')
        .eq('id', inviteId)
        .maybeSingle();
      if (existing && !existing.redeemed_at && !existing.revoked_at) {
        code = existing.code;
      }
    }
    if (!code) {
      code = generateInviteCode();
      const { data: invite, error } = await admin
        .from('invites')
        .insert({ code, created_by_user_id: ctx.appUser.id, note: 'waitlist' })
        .select('id')
        .single();
      if (error) throw new Error(`invite insert failed: ${error.message}`);
      inviteId = invite.id;
    }

    const { error: updateError } = await admin
      .from('waitlist_entries')
      .update({ status: 'invited', invite_id: inviteId, invited_at: new Date().toISOString() })
      .eq('id', entry.id);
    if (updateError) throw new Error(`waitlist update failed: ${updateError.message}`);

    if (entry.email) {
      const signupUrl = new URL('/signup', env.APP_URL);
      signupUrl.searchParams.set('code', code);
      await getEmailProvider().send(inviteEmail(entry.email, code, signupUrl.toString()));
    }

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'waitlist.invited',
      targetType: 'waitlist_entry',
      targetId: entry.id,
      metadata: { inviteId },
    });

    // code returned so admins can hand-deliver to phone-only entries
    return apiOk({ code, channel: entry.email ? 'email' : 'manual' });
  } catch (error) {
    return handleApiError(error);
  }
}
