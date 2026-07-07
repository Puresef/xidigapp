import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { alertSkillGaps, markDormantAndNudge } from '@/lib/labs/sweeps';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Daily Labs sweep (vercel.json cron → this route): §16 dormancy nudges after
 * 28 days idle (encouragement only — never demotes) + the 7-day skills-gap
 * alert. Machine endpoint — auth is the shared CRON_SECRET as
 * `Authorization: Bearer <CRON_SECRET>`; unset = disabled (503), mirroring
 * /api/cron/plaza.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
    if (!secret) return apiError('server_error', 503);
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return apiError('forbidden', 401);
    }

    const admin = getSupabaseAdmin();
    const labsMarkedDormant = await markDormantAndNudge(admin);
    const skillAlertsSent = await alertSkillGaps(admin);

    return apiOk({ labsMarkedDormant, skillAlertsSent });
  } catch (error) {
    return handleApiError(error);
  }
}
