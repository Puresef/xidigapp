import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import {
  alertSkillGaps,
  demoteTimedOutVentures,
  markDormantAndNudge,
  warnTimedOutVentures,
} from '@/lib/labs/sweeps';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Daily Labs sweep (vercel.json cron → this route): §16 dormancy nudges after
 * 28 days idle (a marker and an early warning — not the stage-demotion path),
 * the 7-day skills-gap alert, and the Maal stage timeout (ruling 2) — warn at
 * 70 days idle, demote back to Warshad at 84.
 *
 * Warn runs BEFORE demote in the same pass, deliberately: the demote RPC
 * refuses any venture that has not been warned and given its grace week, so
 * ordering them this way means a venture crossing both thresholds is warned now
 * and demoted a week from now, never both at once.
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
    const venturesWarned = await warnTimedOutVentures(admin);
    const venturesDemoted = await demoteTimedOutVentures(admin);

    return apiOk({ labsMarkedDormant, skillAlertsSent, venturesWarned, venturesDemoted });
  } catch (error) {
    return handleApiError(error);
  }
}
