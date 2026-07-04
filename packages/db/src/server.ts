import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Server-side Supabase client using the SECRET key.
 *
 * NEVER import this into client components — the secret key bypasses Row
 * Level Security. The caller is responsible for passing values that originate
 * from validated server env (see apps/web/src/env.ts).
 */
export function createServerClient(
  supabaseUrl: string,
  secretKey: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
