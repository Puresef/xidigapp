import { LOCALE_COOKIE, isLocale } from '@xidig/i18n';
import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emailSchema } from '@/lib/auth/identifiers';
import { safeNextPath } from '@/lib/auth/links';
import { consumeAuthToken, findLatestEmailToken } from '@/lib/auth/tokens';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin, getSupabaseServer } from '@/lib/supabase/server';

/**
 * Numeric fallback for email links (deliverability hardening): the 6-digit
 * companion code carried in magic-link and signup-confirmation emails, for
 * clients that mangle or pre-fetch links. Link and code are the same
 * underlying single-use GoTrue token, so the same 10-minute ledger window
 * applies — an expired code speaks the §27 otp copy.
 */

const bodySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^[0-9]{4,10}$/),
  next: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());

    // Codes are 6 digits — brute force must be expensive.
    await enforceRateLimit(`eotp:ip:${clientIp(request)}`, { max: 10, windowSeconds: 300 });
    await enforceRateLimit(`eotp:id:${body.email}`, { max: 5, windowSeconds: 300 });

    const admin = getSupabaseAdmin();
    const latest = await findLatestEmailToken(admin, body.email);
    if (!latest || latest.status === 'expired') {
      throw new ApiError('otp_invalid', 400);
    }

    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      email: body.email,
      token: body.code,
      type: latest.type === 'signup' ? 'signup' : 'magiclink',
    });
    if (error) throw new ApiError('otp_invalid', 400);

    await consumeAuthToken(admin, latest.tokenHash);

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
