import { apiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { resetSeed, runSeed } from '@/lib/seed/run';
import { decideConfiguredSeedTarget, seedTargetRefusedResponse } from '@/lib/seed/target-response';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { env } from '@/env';

/**
 * Seed job trigger (PRD §21 "trigger seed jobs, admin/service scope only").
 *
 * Authorised by EITHER an admin session (dashboard button) OR the shared
 * CRON_SECRET bearer (the CLI wrapper / staging automation) — the same
 * service-scope posture as the cron routes. POST runs the idempotent seed;
 * DELETE resets a seed run (tear-down). Both are audited.
 *
 * The launch-density seed is labelled platform content and may run against
 * production (owner-approved). Its DESTRUCTIVE reset may not: it is refused
 * unless the DATABASE is a verified non-production target
 * (lib/seed/target-guard.ts) — the production project ref is refused whatever
 * NODE_ENV says. NODE_ENV alone was never enough: the Supabase project
 * labelled "Dev Xidig App" is the live production database.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Returns the acting admin's id, or null for a service (CRON_SECRET) call.
 *  Throws (via requireRole) when neither credential is present. */
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
    const { actorUserId } = await authorizeSeed(request);
    const admin = getSupabaseAdmin();
    const summary = await runSeed(admin);
    await writeAudit(admin, {
      actorUserId,
      action: 'seed.run',
      metadata: { ...summary },
    });
    return apiOk({ ok: true, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { actorUserId } = await authorizeSeed(request);
    // Guard: never allow a destructive reset in production — decided by the
    // database target, not only by the process mode.
    if (env.NODE_ENV === 'production') return apiError('forbidden', 403);
    const target = decideConfiguredSeedTarget();
    if (!target.allowed) return seedTargetRefusedResponse(target);
    const admin = getSupabaseAdmin();
    const summary = await resetSeed(admin);
    await writeAudit(admin, {
      actorUserId,
      action: 'seed.reset',
      metadata: { ...summary },
    });
    return apiOk({ ok: true, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
