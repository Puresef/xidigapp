import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { sweepStaleDmRequests } from '@/lib/dm/sweep';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Daily DM-request sweep (vercel.json cron → this route): pending AND
 * declined conversations idle past 30 days are deleted — messages cascade,
 * voice notes are cleaned from the private bucket (lib/dm/sweep.ts owns the
 * ordering). Machine endpoint — auth is the shared CRON_SECRET as
 * `Authorization: Bearer <CRON_SECRET>`; unset = disabled (503), mirroring
 * /api/cron/lifecycle.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
    if (!secret) return apiError('server_error', 503);
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return apiError('forbidden', 401);
    }

    const admin = getSupabaseAdmin();
    const counts = await sweepStaleDmRequests(admin);

    return apiOk({ counts });
  } catch (error) {
    return handleApiError(error);
  }
}
