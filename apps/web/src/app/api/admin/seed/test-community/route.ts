import { apiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { resetTestCommunity, runTestCommunity } from '@/lib/seed/test-community/run';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { env } from '@/env';

/**
 * TEST-COMMUNITY seed trigger (pre-launch test phase).
 *
 * Same authorisation posture as /api/admin/seed (admin session OR CRON_SECRET
 * bearer), but UNLIKE the launch-density seed this one is blocked outright in
 * production for BOTH run and reset: it provisions fake member accounts, which
 * must never exist on a live database (locked §21 "no fake people" rule —
 * test/staging environments only).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function authorizeSeed(request: Request): Promise<{ actorUserId: string | null }> {
  const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
    return { actorUserId: null };
  }
  const ctx = await requireRole('admin');
  return { actorUserId: ctx.appUser.id };
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (env.NODE_ENV === 'production') return apiError('forbidden', 403);
    const { actorUserId } = await authorizeSeed(request);
    const admin = getSupabaseAdmin();
    const summary = await runTestCommunity(admin);
    await writeAudit(admin, {
      actorUserId,
      action: 'seed.test_community.run',
      metadata: {
        usersCreated: summary.usersCreated,
        usersExisting: summary.usersExisting,
        contentSeeded: summary.contentSeeded,
        counts: summary.counts,
      },
    });
    return apiOk({ ok: true, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    if (env.NODE_ENV === 'production') return apiError('forbidden', 403);
    const { actorUserId } = await authorizeSeed(request);
    const admin = getSupabaseAdmin();
    const summary = await resetTestCommunity(admin);
    await writeAudit(admin, {
      actorUserId,
      action: 'seed.test_community.reset',
      metadata: { ...summary },
    });
    return apiOk({ ok: true, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
