import { after } from 'next/server';
import { z } from 'zod';

import { ApiError, apiNotice, handleApiError } from '@/lib/api';
import { normalizePhone } from '@/lib/auth/identifiers';
import { sendPhoneOtp, type OtpChannel } from '@/lib/auth/otp';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin, getSupabaseServer } from '@/lib/supabase/server';

/**
 * Phone OTP sign-in, step 1: send the code (10-minute expiry, configured as
 * sms_otp_exp in Supabase). Channel-agnostic per §26 — 'whatsapp' becomes a
 * valid channel value in v1.1 with zero API change.
 *
 * Neutral response whether or not the phone has an account (no enumeration);
 * the SMS is only actually sent to existing members.
 */

const bodySchema = z.object({
  phone: z.string().trim().min(4),
  channel: z.custom<OtpChannel>((v) => v === 'sms' || v === 'whatsapp').default('sms'),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());

    const phone = normalizePhone(body.phone);
    if (!phone) throw new ApiError('phone_invalid', 400);

    await enforceRateLimit(`otp:ip:${clientIp(request)}`, { max: 10, windowSeconds: 600 });
    await enforceRateLimit(`otp:id:${phone}`, { max: 3, windowSeconds: 600 });

    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from('users')
      .select('id, status')
      .eq('phone', phone)
      .maybeSingle();

    // after(): off the response path — account existence must not show up as
    // response-time skew, and a provider outage must not become an existence
    // oracle either (logged, not surfaced).
    if (existing && (existing.status === 'active' || existing.status === 'pending_deletion')) {
      const supabase = await getSupabaseServer();
      after(async () => {
        try {
          await sendPhoneOtp(supabase, phone, { channel: body.channel, shouldCreateUser: false });
        } catch (error) {
          console.error('[auth] sign-in OTP send failed:', error);
        }
      });
    }

    return apiNotice('otp_sent');
  } catch (error) {
    return handleApiError(error);
  }
}
