import { apiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { resetSeed, runSeed } from '@/lib/seed/run';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { env } from '@/env';

/**
 * Seed job trigger (PRD §21 "trigger seed jobs, admin/service scope only").
 *
 * Authorised by EITHER an admin session (dashboard button) OR the shared
 * CRON_SECRET bearer (the CLI wrapper / staging automation) — the same
 * service-scope posture as the cron routes. POST runs the idempotent seed;
 * DELETE resets a seed run (local/staging tear-down). Both are audited.
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
    // Guard: never allow a destructive reset in production.
    if (env.NODE_ENV === 'production') return apiError('forbidden', 403);
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
