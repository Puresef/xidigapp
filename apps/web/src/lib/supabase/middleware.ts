import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresh the auth session on every matched request (the middleware half of
 * the @supabase/ssr pattern). Expired-but-refreshable sessions get new
 * cookies; dead sessions get cleared. Returns the (possibly refreshed) user
 * plus the response carrying any Set-Cookie headers — the caller MUST return
 * that response (or copy its cookies) or sessions will desync.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ user: User | null; response: NextResponse; hadAuthCookies: boolean }> {
  let response = NextResponse.next({ request });

  const hadAuthCookies = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() (not getSession()) — validates the JWT against the auth server
  // instead of trusting the cookie contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, response, hadAuthCookies };
}
