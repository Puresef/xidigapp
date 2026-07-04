import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { validateInviteCode } from '@/lib/auth/invites';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Pre-signup invite-code check so the form can fail fast with §27 copy.
 * Advisory only — signup revalidates server-side (and the DB trigger is the
 * final gate). Rate-limited: this is the code-guessing surface.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await enforceRateLimit(`invval:ip:${clientIp(request)}`, { max: 20, windowSeconds: 600 });

    const code = new URL(request.url).searchParams.get('code') ?? '';
    const result = await validateInviteCode(getSupabaseAdmin(), code);
    if (!result.ok) {
      throw new ApiError(result.code, result.code === 'invite_used' ? 409 : 400);
    }

    return apiOk({ valid: true });
  } catch (error) {
    return handleApiError(error);
  }
}
