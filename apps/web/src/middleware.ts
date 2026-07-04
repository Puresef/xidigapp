import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

/**
 * Session middleware: refreshes the Supabase session cookies on every
 * matched request and enforces signed-in access for protected sections.
 *
 * Role checks (mod/admin) are NOT done here — they belong to the API guards
 * and server layouts (API-first, §22): middleware only decides
 * signed-in vs signed-out routing.
 */

/** Path prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = ['/settings', '/admin', '/onboarding'];

/** Signed-in users have no business on these pages. */
const AUTH_PAGES = ['/signin', '/signup'];

export async function middleware(request: NextRequest) {
  const { user, response, hadAuthCookies } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.search = '';
    // Stale auth cookies = a session that expired, not a first visit; §27
    // wants that explained ("You've been signed out…").
    if (hadAuthCookies) url.searchParams.set('reason', 'session_expired');
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Skip static assets and images; run everywhere else (API routes included —
  // they read the refreshed cookies).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
