import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { sendEventReminders } from '@/lib/events/reminders';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Hourly events cron (vercel.json → this route): the T-24h RSVP reminder
 * sweep (extras item 8, locked design). Idempotent — the sweep claims each
 * event once via events.reminded_at (lib/events/reminders.ts), so re-runs and
 * overlaps never double-remind.
 *
 * Auth is the shared CRON_SECRET (Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>`). Unset secret = disabled (503), matching the other cron
 * routes.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
    if (!secret) return apiError('server_error', 503);
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return apiError('forbidden', 401);
    }

    const result = await sendEventReminders(getSupabaseAdmin());
    return apiOk({ reminders: result });
  } catch (error) {
    return handleApiError(error);
  }
}
