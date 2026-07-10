import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Nightly reputation recompute cron (vercel.json → this route).
 *
 * Adjacent Phase-7 hardening: Phase 7 shipped `recompute_reputation_scores()`
 * (the §14 90-day decay authority, service-role-only) but left it unscheduled
 * ("recomputed by jobs"). This wires it to Vercel cron so scores actually decay
 * and any drift from the incremental path self-heals. Idempotent.
 *
 * Auth is the shared CRON_SECRET (same posture as the other cron routes).
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

    const admin = getSupabaseAdmin();
    // No arg → p_user_id defaults to null → recompute everyone.
    const { error } = await admin.rpc('recompute_reputation_scores');
    if (error) throw new Error(`recompute_reputation_scores failed: ${error.message}`);

    return apiOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
