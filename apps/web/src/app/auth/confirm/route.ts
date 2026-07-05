import { LOCALE_COOKIE, isLocale } from '@xidig/i18n';
import { NextResponse, type NextRequest } from 'next/server';

import type { EmailOtpType } from '@supabase/supabase-js';

import { env } from '@/env';
import { safeNextPath } from '@/lib/auth/links';
import { checkAuthToken, consumeAuthToken, hashAppToken } from '@/lib/auth/tokens';
import { getSupabaseAdmin, getSupabaseServer } from '@/lib/supabase/server';

/**
 * Landing for every self-sent auth email link (magic link, signup confirm,
 * recovery, email change, email linking). Order matters:
 *
 *   1. ledger lookup by token_hash — the RECORDED type (never the caller's
 *      ?type= param) decides whether the 10-minute window applies, so URL
 *      rewriting cannot stretch a short-lived link to GoTrue's 60 minutes;
 *   2. 'email_link' tokens are app-owned (phone-only accounts adding an
 *      email): the click IS the ownership proof — only then is the email
 *      attached, already confirmed. GoTrue never sees these tokens;
 *   3. everything else goes to GoTrue verification (single-use, 60-min
 *      ceiling), then account-state checks and §27-coded redirects —
 *      recovery links get their own 60-minute expired copy.
 */

/** GoTrue types the app actually issues (links.ts). Anything else is noise. */
const GOTRUE_TYPES = new Set(['magiclink', 'signup', 'recovery', 'email_change']);

function errorRedirect(reason: string, from: string): NextResponse {
  const url = new URL('/auth/error', env.APP_URL);
  url.searchParams.set('reason', reason);
  url.searchParams.set('from', from);
  return NextResponse.redirect(url);
}

function expiredRedirect(effectiveType: string): NextResponse {
  return errorRedirect(
    effectiveType === 'recovery' ? 'reset_link_expired' : 'magic_link_expired',
    effectiveType,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const queryType = searchParams.get('type') ?? '';
  const next = safeNextPath(searchParams.get('next'));

  if (!tokenHash) {
    return errorRedirect('magic_link_expired', queryType || 'magiclink');
  }

  const admin = getSupabaseAdmin();

  // App-namespace email-linking tokens: stored hashed, so hash the incoming
  // raw value for the ledger lookup.
  const isEmailLink = queryType === 'email_link';
  const ledgerHash = isEmailLink ? hashAppToken(tokenHash) : tokenHash;

  const check = await checkAuthToken(admin, ledgerHash);
  const effectiveType = check.recordedType ?? queryType;

  if (check.status === 'expired') {
    return expiredRedirect(effectiveType);
  }

  if (effectiveType === 'email_link') {
    // The claimed and recorded namespaces must agree — a GoTrue token
    // presented as email_link (or vice versa) is treated as invalid.
    if (!isEmailLink || !check.recordedType) {
      return errorRedirect('magic_link_expired', 'email_link');
    }
    const { data: row } = await admin
      .from('auth_email_tokens')
      .select('user_id, email')
      .eq('token_hash', ledgerHash)
      .maybeSingle();
    if (!row?.user_id) {
      return errorRedirect('magic_link_expired', 'email_link');
    }

    // Ownership proven by the click — attach CONFIRMED. auth.users unique
    // constraints reject the race where the address got claimed meanwhile.
    const { error } = await admin.auth.admin.updateUserById(row.user_id, {
      email: row.email,
      email_confirm: true,
    });
    if (error) {
      return errorRedirect('email_taken', 'email_link');
    }
    await consumeAuthToken(admin, ledgerHash);
    return NextResponse.redirect(new URL('/settings/account', env.APP_URL));
  }

  if (!GOTRUE_TYPES.has(effectiveType)) {
    return errorRedirect('magic_link_expired', effectiveType || 'magiclink');
  }

  // GoTrue verification — creates the session cookies via the ssr client.
  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: effectiveType as EmailOtpType,
  });
  if (error) {
    return expiredRedirect(effectiveType);
  }

  await consumeAuthToken(admin, ledgerHash);

  // Account state (RLS: own row).
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
    return errorRedirect('account_suspended', effectiveType);
  }
  if (appUser?.status === 'deactivated' || appUser?.status === 'deleted') {
    await supabase.auth.signOut();
    return errorRedirect('forbidden', effectiveType);
  }

  // Destination: recovery lands on the new-password form; everything else
  // honours ?next (open-redirect-guarded).
  const destination = effectiveType === 'recovery' ? '/reset-password' : next;
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
