import { LOCALE_COOKIE, isLocale } from '@xidig/i18n';
import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { normalizePhone } from '@/lib/auth/identifiers';
import { safeNextPath } from '@/lib/auth/links';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Phone OTP, step 2: verify the code and create the session (type 'sms'),
 * or finish linking a new phone to the signed-in account ('phone_change').
 */

const bodySchema = z.object({
  phone: z.string().trim().min(4),
  token: z.string().trim().min(4).max(10),
  type: z.enum(['sms', 'phone_change']).default('sms'),
  next: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());

    const phone = normalizePhone(body.phone);
    if (!phone) throw new ApiError('phone_invalid', 400);

    // Verification attempts are the brute-force surface — limit hard.
    await enforceRateLimit(`otpv:ip:${clientIp(request)}`, { max: 20, windowSeconds: 600 });
    await enforceRateLimit(`otpv:id:${phone}`, { max: 10, windowSeconds: 600 });

    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token: body.token,
      type: body.type,
    });
    if (error) throw new ApiError('otp_invalid', 400);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: appUser } = await supabase
      .from('users')
      .select('status, preferred_language')
      .eq('id', user!.id)
      .maybeSingle();

    if (appUser?.status === 'suspended') {
      await supabase.auth.signOut();
      throw new ApiError('account_suspended', 403);
    }
    if (appUser?.status === 'deactivated' || appUser?.status === 'deleted') {
      await supabase.auth.signOut();
      throw new ApiError('forbidden', 403);
    }

    const response = apiOk({ next: safeNextPath(body.next) });
    if (appUser && isLocale(appUser.preferred_language)) {
      response.cookies.set(LOCALE_COOKIE, appUser.preferred_language, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
