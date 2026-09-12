import { apiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import {
  configuredSupabaseUrls,
  decideConfiguredSeedTarget,
  seedTargetRefusedResponse,
} from '@/lib/seed/target-response';
import { resetTestCommunity, runTestCommunity } from '@/lib/seed/test-community/run';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { env } from '@/env';

/**
 * TEST-COMMUNITY seed trigger (pre-launch test phase).
 *
 * Same authorisation posture as /api/admin/seed (admin session OR CRON_SECRET
 * bearer). It provisions fake member accounts, which must never exist on a
 * live database (locked §21 "no fake people" rule), so BOTH run and reset are
 * refused unless the DATABASE is a verified non-production target
 * (lib/seed/target-guard.ts). The production project ref (the Supabase
 * project labelled "Dev Xidig App", tbdryvhxxiqadseuxclm — the live xidig.net
 * DB) is refused whatever NODE_ENV says, and an undeterminable target fails
 * closed. The old guard was NODE_ENV only; a local dev server pointed at
 * production passed it, which is how the test community reached production
 * (12 Sep 2026 audit). The target is checked BEFORE auth and before any client
 * is built.
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
    const target = decideConfiguredSeedTarget();
    if (!target.allowed) return seedTargetRefusedResponse(target);
    const { actorUserId } = await authorizeSeed(request);
    const admin = getSupabaseAdmin();
    const summary = await runTestCommunity(admin, { targetUrls: configuredSupabaseUrls() });
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
    const target = decideConfiguredSeedTarget();
    if (!target.allowed) return seedTargetRefusedResponse(target);
    const { actorUserId } = await authorizeSeed(request);
    const admin = getSupabaseAdmin();
    const summary = await resetTestCommunity(admin, { targetUrls: configuredSupabaseUrls() });
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
