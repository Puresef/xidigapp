import { apiOk, handleApiError } from '@/lib/api';
import { getSupabaseServer } from '@/lib/supabase/server';

/** Sign out: revokes the refresh token and clears session cookies. */
export async function POST(): Promise<Response> {
  try {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut();
    return apiOk({ signedOut: true });
  } catch (error) {
    return handleApiError(error);
  }
}
