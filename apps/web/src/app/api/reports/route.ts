import { z } from 'zod';

import { apiNotice, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Report entry point (§13 "block + report inside DMs"). Phase 3 ships
 * submission only — it records a report row and returns the §27 "thanks for
 * the report" notice. The Phase 6 mod queue (SLA timer, mod actions, appeals)
 * consumes these rows later. API-only (service role); reporters read their own
 * report status via RLS (reports_select_own).
 */

const reportSchema = z.object({
  targetType: z.enum(['user', 'conversation', 'message', 'post', 'comment']),
  targetId: z.string().uuid(),
  reason: z.enum([
    'spam',
    'harassment',
    'impersonation',
    'fraud_or_scam',
    'inappropriate_content',
    'misinformation',
    'other',
  ]),
  details: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = reportSchema.parse(await request.json());

    // Light abuse guard on report submission itself.
    await enforceRateLimit(`report:${ctx.appUser.id}`, { max: 20, windowSeconds: 3600 });

    const admin = getSupabaseAdmin();
    const { error } = await admin.from('reports').insert({
      reporter_user_id: ctx.appUser.id,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      details: input.details ?? null,
    });
    if (error) throw new Error(`report insert failed: ${error.message}`);

    return apiNotice('report_submitted');
  } catch (error) {
    return handleApiError(error);
  }
}
