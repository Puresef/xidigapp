import { ApiError, apiNotice, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { VERIFICATION_REQUEST_RATE } from '@/lib/moderation/constants';
import { verificationRequestSchema } from '@/lib/moderation/schemas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Member-facing verification request (§14 "Get verified"). POST opens an
 * identity or business verification: recording consent is HARD-gated here (no
 * consent → no request), one open request per type is enforced, and the
 * request lands as a `pending` row for the §14 verifier queue to pick up. GET
 * lists the caller's own requests (never the recording_url — that is verifier-
 * only and access-logged). All writes are service role: `verifications` has no
 * client write grant; members only read their own rows via RLS.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = verificationRequestSchema.parse(await request.json());
    await enforceRateLimit(`verify_req:${ctx.appUser.id}`, VERIFICATION_REQUEST_RATE);

    // §14 recording consent is a precondition, not a checkbox we can defer.
    if (!input.consentGiven) throw new ApiError('invalid_request', 400);

    const admin = getSupabaseAdmin();

    // One open request per type — a member can't stack pending/scheduled calls.
    const { data: existing, error: existingError } = await admin
      .from('verifications')
      .select('id')
      .eq('user_id', ctx.appUser.id)
      .eq('type', input.type)
      .in('status', ['pending', 'scheduled'])
      .maybeSingle();
    if (existingError) throw new Error(`verification lookup failed: ${existingError.message}`);
    if (existing) throw new ApiError('verification_pending', 409);

    const now = new Date().toISOString();
    const { data: created, error: insertError } = await admin
      .from('verifications')
      .insert({
        user_id: ctx.appUser.id,
        type: input.type,
        listing_id: input.type === 'business' ? (input.listingId ?? null) : null,
        consent_given: true,
        consent_recorded_at: now,
        status: 'pending',
      })
      .select('id')
      .maybeSingle();
    if (insertError) throw new Error(`verification insert failed: ${insertError.message}`);

    // Reflect "pending" on the profile trust surface — only from a clean
    // 'unverified' state, so we never stomp an existing community/identity badge.
    const { error: profileError } = await admin
      .from('profiles')
      .update({ verification_status: 'pending' })
      .eq('user_id', ctx.appUser.id)
      .eq('verification_status', 'unverified');
    if (profileError) throw new Error(`profile status update failed: ${profileError.message}`);

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'verification.requested',
      targetType: 'verification',
      targetId: created?.id,
      metadata: { type: input.type, listingId: input.listingId ?? null },
    });

    return apiNotice('verification_requested');
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    // Own rows via RLS — recording_url deliberately excluded (verifier-only).
    const { data, error } = await ctx.supabase
      .from('verifications')
      .select('id, type, status, scheduled_at, booking_url, info_requested_at, decided_at')
      .eq('user_id', ctx.appUser.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`verification list failed: ${error.message}`);

    return apiOk({ verifications: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
