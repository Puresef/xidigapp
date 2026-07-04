import { LOCALE_COOKIE, isLocale } from '@xidig/i18n';
import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emailSchema } from '@/lib/auth/identifiers';
import { safeNextPath } from '@/lib/auth/links';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseServer } from '@/lib/supabase/server';

/** Email + password sign-in. Errors speak §27, never GoTrue. */

const bodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());

    await enforceRateLimit(`pw:ip:${clientIp(request)}`, { max: 10, windowSeconds: 300 });
    await enforceRateLimit(`pw:id:${body.email}`, { max: 5, windowSeconds: 300 });

    const supabase = await getSupabaseServer();
    const { error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      if (/email.*not.*confirm/i.test(error.message)) {
        throw new ApiError('email_not_confirmed', 403);
      }
      throw new ApiError('wrong_credentials', 401);
    }

    // Post-auth account state check (RLS: own row).
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
    // Language follows the member across devices (users.preferred_language →
    // locale cookie, see lib/locale.ts).
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
