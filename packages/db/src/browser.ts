import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * Browser Supabase client using the PUBLISHABLE key. Safe to use from client
 * components; access is governed by Row Level Security.
 */
export function createBrowserClient(
  supabaseUrl: string,
  publishableKey: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, publishableKey);
}
