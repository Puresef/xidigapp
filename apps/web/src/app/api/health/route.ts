import { NextResponse } from 'next/server';

import { createServerClient } from '@xidig/db';

import { env } from '@/env';

// Never statically evaluate this route at build time; it depends on runtime env.
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  // Touch validated env + the secret-key client to prove the wiring end to
  // end. No network call is made here.
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

  return NextResponse.json({
    status: 'ok',
    supabaseReady: typeof supabase.from === 'function',
  });
}
