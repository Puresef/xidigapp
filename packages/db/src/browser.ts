import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Browser Supabase client using the PUBLISHABLE key. Safe to use from client
 * components; access is governed by Row Level Security.
 *
 * Built on @supabase/ssr so the session lives in cookies shared with the
 * server (middleware refresh, server components, route handlers) — NOT in
 * localStorage. Mixing storage models silently forks the session.
 */
export function createBrowserClient(
  supabaseUrl: string,
  publishableKey: string,
): SupabaseClient<Database> {
  return createSSRBrowserClient<Database>(supabaseUrl, publishableKey);
}
