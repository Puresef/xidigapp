import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { alertSkillGaps, countVenturesPastTimeout, markDormantAndNudge } from '@/lib/labs/sweeps';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Daily Labs sweep (vercel.json cron → this route): §16 dormancy nudges after
 * 28 days idle (a marker and a check-in — never a stage change) and the 7-day
 * skills-gap alert.
 *
 * The Maal stage timeout (ruling 2: warn at 70 days idle, demote to Warshad at
 * 84) is PAUSED (owner ruling, 12 Sep) while re-promotion is paused — a one-way
 * automatic demotion would be unfair. This route neither warns nor demotes. It
 * reports `venturesPastTimeout`, a read-only count for private operator review;
 * no Venture's state or public record changes. See lib/labs/sweeps.ts.
 *
 * Machine endpoint — auth is the shared CRON_SECRET as
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
    const venturesPastTimeout = await countVenturesPastTimeout(admin);

    return apiOk({ labsMarkedDormant, skillAlertsSent, venturesPastTimeout });
  } catch (error) {
    return handleApiError(error);
  }
}
