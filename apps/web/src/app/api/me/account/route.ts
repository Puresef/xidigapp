import { ApiError, apiNotice, apiOk, handleApiError } from '@/lib/api';
import { getAuthContext } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { ACCOUNT_LIFECYCLE_RATE, DELETION_GRACE_DAYS } from '@/lib/moderation/constants';
import { accountActionSchema } from '@/lib/moderation/schemas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Member self-service account lifecycle (§19 data rights): deactivate /
 * reactivate / request-deletion / cancel-deletion. Uses getAuthContext (NOT
 * requireUser) because requireUser 403s a deactivated/pending_deletion account
 * — those members must still be able to reactivate or cancel a pending deletion
 * within the §19 30-day grace. Every status write goes through the service-role
 * admin client: `users` has no client write grant for status, and each
 * transition is guarded so a repeated action returns the precise §27 code
 * (already-deactivated / already-requested) rather than silently no-op'ing.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw new ApiError('session_expired', 401);

    const { action } = accountActionSchema.parse(await request.json());
    await enforceRateLimit(`account:${ctx.appUser.id}`, ACCOUNT_LIFECYCLE_RATE);

    const admin = getSupabaseAdmin();
    const me = ctx.appUser.id;
    const status = ctx.appUser.status;
    const now = new Date().toISOString();

    if (action === 'deactivate') {
      // Idempotency-aware: a second deactivate on an already-deactivated account
      // is the 409 the client differentiates; any other non-active state (e.g.
      // pending_deletion / suspended) is a plain forbidden transition.
      if (status !== 'active') {
        throw new ApiError(
          status === 'deactivated' ? 'account_already_deactivated' : 'forbidden',
          status === 'deactivated' ? 409 : 403,
        );
      }
      const { error } = await admin
        .from('users')
        .update({ status: 'deactivated', deactivated_at: now })
        .eq('id', me);
      if (error) throw new Error(`account deactivate failed: ${error.message}`);

      await writeAudit(admin, { actorUserId: me, action: 'user.deactivate' });
      return await apiNotice('account_deactivated');
    }

    if (action === 'reactivate') {
      if (status !== 'deactivated') throw new ApiError('invalid_request', 400);
      const { error } = await admin
        .from('users')
        .update({ status: 'active', deactivated_at: null })
        .eq('id', me);
      if (error) throw new Error(`account reactivate failed: ${error.message}`);

      await writeAudit(admin, { actorUserId: me, action: 'user.reactivate' });
      return apiOk({ status: 'active' });
    }

    if (action === 'request_deletion') {
      // Deletion can be requested from active OR deactivated; anything else
      // (pending_deletion or an ineligible state) is the 409 — pending_deletion
      // being the canonical "already asked" state (deletion_requested_at is set
      // alongside it, and the grace-period sweep reads that timestamp).
      if (status !== 'active' && status !== 'deactivated') {
        throw new ApiError('deletion_already_requested', 409);
      }
      const { error } = await admin
        .from('users')
        .update({ status: 'pending_deletion', deletion_requested_at: now })
        .eq('id', me);
      if (error) throw new Error(`account deletion request failed: ${error.message}`);

      await writeAudit(admin, {
        actorUserId: me,
        action: 'user.deletion.request',
        metadata: { graceDays: DELETION_GRACE_DAYS },
      });
      return await apiNotice('deletion_requested');
    }

    // action === 'cancel_deletion'
    if (status !== 'pending_deletion') throw new ApiError('invalid_request', 400);
    const { error } = await admin
      .from('users')
      .update({ status: 'active', deletion_requested_at: null })
      .eq('id', me);
    if (error) throw new Error(`account deletion cancel failed: ${error.message}`);

    await writeAudit(admin, { actorUserId: me, action: 'user.deletion.cancel' });
    return await apiNotice('deletion_cancelled');
  } catch (error) {
    return handleApiError(error);
  }
}
