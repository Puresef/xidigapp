import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { createServerClient as createServiceClient } from '@xidig/db/server';
import type { Database } from '@xidig/db';

import { env } from '@/env';

/**
 * Cookie-bound Supabase client for Server Components, Server Actions and
 * Route Handlers. Runs as the SIGNED-IN USER (publishable key + session
 * cookies) — every query goes through RLS.
 */
export async function getSupabaseServer(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: middleware refreshes sessions before we get here.
        }
      },
    },
  });
}

/**
 * Service-role client (SECRET key): bypasses RLS and exposes auth.admin.
 * Server-only, and only for the flows that genuinely need it — issuing
 * signup grants, generating auth links, admin operations, audit writes.
 * NEVER let its results flow to a response without an explicit authz check.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  return createServiceClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
}
