import { createBrowserClient } from '@xidig/db/browser';

/**
 * Supabase client for use inside 'use client' components.
 *
 * Deliberately reads `process.env.NEXT_PUBLIC_*` directly instead of importing
 * `src/env.ts` — that module validates the FULL server env (including
 * SUPABASE_SECRET_KEY) at import time, which would run in the browser bundle
 * and throw, since only NEXT_PUBLIC_-prefixed vars are ever available there.
 * Next.js inlines these two at build time via static analysis, so the
 * property access must stay literal (no destructuring, no dynamic keys).
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      '❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
        'Copy .env.example to .env and fill in the required values.',
    );
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
