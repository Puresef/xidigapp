import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ApiError } from '@/lib/api';

/**
 * Channel-agnostic OTP sending (§26: WhatsApp OTP is v1.1 — "build the OTP
 * send channel-agnostic so it drops in later"). GoTrue already takes the
 * channel as a parameter, so v1.1 is: accept 'whatsapp' from the client,
 * pass it through, configure the provider in the dashboard.
 */
export type OtpChannel = 'sms' | 'whatsapp';

/** The only channel enabled in v1.0. */
export const ENABLED_OTP_CHANNELS: readonly OtpChannel[] = ['sms'];

export async function sendPhoneOtp(
  supabase: SupabaseClient<Database>,
  phoneE164: string,
  opts: { channel?: OtpChannel; shouldCreateUser?: boolean } = {},
): Promise<void> {
  const channel = opts.channel ?? 'sms';
  if (!ENABLED_OTP_CHANNELS.includes(channel)) {
    throw new ApiError('invalid_request', 400);
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: {
      channel,
      shouldCreateUser: opts.shouldCreateUser ?? false,
    },
  });

  if (error) {
    // Whatever GoTrue's reason (no SMS provider configured, provider down,
    // signups disabled), the member-facing truth is the same: no text is
    // coming — steer them to a delivery path that works.
    console.error(`[auth] phone OTP send failed (${channel}):`, error.message);
    throw new ApiError('sms_unavailable', 503);
  }
}
