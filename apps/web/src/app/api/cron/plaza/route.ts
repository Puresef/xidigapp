import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { closeDuePolls, nudgeStaleAsks } from '@/lib/plaza/sweeps';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Hourly Plaza sweep (vercel.json cron → this route): §15/§26 stale-Ask
 * nudges + Seq 14 poll auto-close.
 *
 * Machine endpoint — no requireUser. Auth is the shared CRON_SECRET, which
 * Vercel Cron sends as `Authorization: Bearer <CRON_SECRET>` automatically.
 * Unset secret = endpoint disabled (503), matching the EMAIL_WEBHOOK_SECRET
 * precedent in /api/webhooks/email.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
    if (!secret) return apiError('server_error', 503);
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return apiError('forbidden', 401);
    }

    const admin = getSupabaseAdmin();
    const asksNudged = await nudgeStaleAsks(admin);
    const pollsClosed = await closeDuePolls(admin);

    return apiOk({ asksNudged, pollsClosed });
  } catch (error) {
    return handleApiError(error);
  }
}
