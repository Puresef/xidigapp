import { LOCALE_COOKIE, isLocale } from '@xidig/i18n';
import { NextResponse, type NextRequest } from 'next/server';

import type { EmailOtpType } from '@supabase/supabase-js';

import { env } from '@/env';
import { safeNextPath } from '@/lib/auth/links';
import { checkAuthToken, consumeAuthToken } from '@/lib/auth/tokens';
import { getSupabaseAdmin, getSupabaseServer } from '@/lib/supabase/server';

/**
 * Landing for every self-sent auth email link (magic link, signup confirm,
 * recovery, email change). Order matters:
 *
 *   1. app-side 10-minute expiry (auth_email_tokens) for magiclink/signup/
 *      email_change — GoTrue's global email expiry is 60 min for the sake of
 *      recovery links (§26/§27 split);
 *   2. GoTrue verification (single-use, 60-min ceiling);
 *   3. account-state check (§27 suspended copy, not a broken session);
 *   4. locale hydration and §27-coded redirects.
 */

const VERIFY_TYPES = new Set(['magiclink', 'signup', 'recovery', 'email_change', 'email', 'invite']);

function errorRedirect(reason: string): NextResponse {
  const url = new URL('/auth/error', env.APP_URL);
  url.searchParams.set('reason', reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = safeNextPath(searchParams.get('next'));

  if (!tokenHash || !type || !VERIFY_TYPES.has(type)) {
    return errorRedirect('magic_link_expired');
  }

  const admin = getSupabaseAdmin();

  // 1. App-enforced 10-minute window (only 10-minute types can come back
  //    expired here; recovery defers to GoTrue's 60 minutes).
  if ((await checkAuthToken(admin, tokenHash, type)) === 'expired') {
    return errorRedirect('magic_link_expired');
  }

  // 2. GoTrue verification — creates the session cookies via the ssr client.
  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });
  if (error) {
    return errorRedirect('magic_link_expired');
  }

  await consumeAuthToken(admin, tokenHash);

  // 3. Account state (RLS: own row).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = user
    ? await supabase
        .from('users')
        .select('status, preferred_language')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null };

  if (appUser?.status === 'suspended') {
    await supabase.auth.signOut();
    return errorRedirect('account_suspended');
  }
  if (appUser?.status === 'deactivated' || appUser?.status === 'deleted') {
    await supabase.auth.signOut();
    return errorRedirect('forbidden');
  }

  // 4. Destination: recovery lands on the new-password form; everything else
  //    honours ?next (open-redirect-guarded).
  const destination = type === 'recovery' ? '/reset-password' : next;
  const response = NextResponse.redirect(new URL(destination, env.APP_URL));
  if (appUser && isLocale(appUser.preferred_language)) {
    response.cookies.set(LOCALE_COOKIE, appUser.preferred_language, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }
  return response;
}
