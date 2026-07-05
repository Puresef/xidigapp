import { z } from 'zod';

import { env } from '@/env';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { emailSchema } from '@/lib/auth/identifiers';
import { sendAuthLink } from '@/lib/auth/links';
import { mintAppToken, recordAuthToken } from '@/lib/auth/tokens';
import { sendEmailChecked } from '@/lib/email/send';
import { emailChangeEmail } from '@/lib/email/templates';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Link (or change) the email on the signed-in account — §9 account linking:
 * additional methods attach to the SAME canonical account, never a new one.
 *
 * VERIFICATION-FIRST in both branches (adversarial-review fix — attaching an
 * unconfirmed email would let an attacker squat/pre-hijack an address they
 * don't own):
 * - Account already has an email → GoTrue email_change flow (nothing changes
 *   until the new address confirms).
 * - Phone-only account → an app-namespace 10-minute token is emailed to the
 *   address; ONLY the click in that inbox attaches the email (already
 *   confirmed) via /auth/confirm?type=email_link. Until then auth.users is
 *   untouched — nothing is blocked or claimable.
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
      const token = mintAppToken();
      await recordAuthToken(admin, {
        tokenHash: token.hash,
        email: body.email,
        type: 'email_link',
        userId: ctx.appUser.id,
      });
      const url = new URL('/auth/confirm', env.APP_URL);
      url.searchParams.set('token_hash', token.raw);
      url.searchParams.set('type', 'email_link');
      await sendEmailChecked(admin, emailChangeEmail(body.email, url.toString()));
    }

    return apiOk({ pendingEmail: body.email });
  } catch (error) {
    return handleApiError(error);
  }
}
