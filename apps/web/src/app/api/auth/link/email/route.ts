import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { emailSchema } from '@/lib/auth/identifiers';
import { sendAuthLink } from '@/lib/auth/links';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Link (or change) the email on the signed-in account — §9 account linking:
 * additional methods attach to the SAME canonical account, never a new one.
 *
 * - Account already has an email → GoTrue email_change flow (verification-
 *   first: nothing changes until the new address confirms).
 * - Phone-only account → the email is attached unconfirmed, then a
 *   confirmation link is sent. Until confirmed it cannot be used to sign in
 *   with a password, and any magic link goes only to that inbox. Known
 *   trade-off: an unconfirmed link blocks that address for new signups until
 *   it confirms or ops clears it (beta-acceptable; documented in the runbook).
 */

const bodySchema = z.object({ email: emailSchema });

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const body = bodySchema.parse(await request.json());

    await enforceRateLimit(`linkemail:${ctx.appUser.id}`, { max: 3, windowSeconds: 3600 });

    const admin = getSupabaseAdmin();

    // One canonical account: an email attached to ANY other account is out.
    const { data: taken } = await admin
      .from('users')
      .select('id')
      .eq('email', body.email)
      .neq('id', ctx.appUser.id)
      .maybeSingle();
    if (taken) throw new ApiError('email_taken', 409);

    if (ctx.appUser.email) {
      if (ctx.appUser.email.toLowerCase() === body.email) {
        throw new ApiError('invalid_request', 400);
      }
      await sendAuthLink(admin, {
        kind: 'email_change',
        currentEmail: ctx.appUser.email,
        newEmail: body.email,
      });
    } else {
      const { error } = await admin.auth.admin.updateUserById(ctx.appUser.id, {
        email: body.email,
        email_confirm: false,
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          throw new ApiError('email_taken', 409);
        }
        throw new Error(`link email failed: ${error.message}`);
      }
      await sendAuthLink(admin, { kind: 'magiclink', email: body.email }, '/settings/account');
    }

    return apiOk({ pendingEmail: body.email });
  } catch (error) {
    return handleApiError(error);
  }
}
