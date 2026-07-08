import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { runLifecycleSweep } from '@/lib/lifecycle/sweeps';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Daily lifecycle sweep (vercel.json cron → this route): §19 grace-expiry
 * anonymisation of accounts past the 30-day window + §14 expired verification-
 * recording purge. Machine endpoint — auth is the shared CRON_SECRET as
 * `Authorization: Bearer <CRON_SECRET>`; unset = disabled (503), mirroring
 * /api/cron/labs.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
    if (!secret) return apiError('server_error', 503);
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return apiError('forbidden', 401);
    }

    const admin = getSupabaseAdmin();
    const counts = await runLifecycleSweep(admin);

    return apiOk({ counts });
  } catch (error) {
    return handleApiError(error);
  }
}
