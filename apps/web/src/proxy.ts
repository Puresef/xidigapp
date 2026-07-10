import { NextResponse, type NextRequest } from 'next/server';

import { apexHostRedirect } from '@/lib/apex-redirect';
import { isApexDeployment } from '@/lib/seo';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Session proxy (Next 16's renamed `middleware` convention): refreshes the
 * Supabase session cookies on every matched request and enforces signed-in
 * access for protected sections.
 *
 * Role checks (mod/admin) are NOT done here — they belong to the API guards
 * and server layouts (API-first, §22): the proxy only decides
 * signed-in vs signed-out routing.
 */

/** Path prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = ['/settings', '/admin', '/onboarding'];

/** Signed-in users have no business on these pages. */
const AUTH_PAGES = ['/signin', '/signup'];

export async function proxy(request: NextRequest) {
  // Apex canonical 308 (cutover step 7) — inert until this deployment IS the
  // apex, then moves stale app.xidig.net/www links (shares, in-flight auth
  // emails) to xidig.net. Runs before the session refresh: a request we're
  // bouncing to another origin needs no cookie rotation (host-only session
  // cookies don't transfer anyway — the expected one-time re-auth).
  const apexUrl = apexHostRedirect({
    isApex: isApexDeployment(),
    host: request.headers.get('host'),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });
  if (apexUrl) return NextResponse.redirect(apexUrl, 308);

  const { user, response, hadAuthCookies } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Any redirect must carry the cookies updateSession staged on `response`
  // (refresh-token rotation / cookie clearing) — a bare redirect would drop
  // the rotated session and desync the client (adversarial-review fix).
  function redirectWithSessionCookies(url: URL): NextResponse {
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.search = '';
    // Stale auth cookies = a session that expired, not a first visit; §27
    // wants that explained ("You've been signed out…").
    if (hadAuthCookies) url.searchParams.set('reason', 'session_expired');
    url.searchParams.set('next', pathname);
    return redirectWithSessionCookies(url);
  }

  if (user && AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return redirectWithSessionCookies(url);
  }

  return response;
}

export const config = {
  // Skip static assets and images; run everywhere else (API routes included —
  // they read the refreshed cookies).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
