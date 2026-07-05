import { z } from 'zod';

import { ApiError, apiNotice, handleApiError } from '@/lib/api';
import { recordSignupConsents } from '@/lib/auth/consent';
import { issueSignupGrant } from '@/lib/auth/grants';
import { emailSchema, normalizePhone } from '@/lib/auth/identifiers';
import { validateInviteCode } from '@/lib/auth/invites';
import { mintAuthLink, sendAuthLink } from '@/lib/auth/links';
import { getEmailProvider } from '@/lib/email/provider';
import { sendPhoneOtp } from '@/lib/auth/otp';
import { validatePassword } from '@/lib/auth/password-policy';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin, getSupabaseServer } from '@/lib/supabase/server';

/**
 * Signup (beta-gated, §9): one endpoint, three co-equal methods.
 * Sequence: rate limit → invite code → (existing account? converge, §9 "one
 * canonical account") → signup grant → create the account through the
 * matching channel. The DB trigger enforces the grant server-side, so this
 * route is the ONLY door in.
 */

const base = {
  inviteCode: z.string().trim().min(1),
  // §9 "+ terms": consent must be explicit, not defaulted.
  acceptTerms: z.literal(true),
};

const bodySchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('password'), email: emailSchema, password: z.string(), ...base }),
  z.object({ method: z.literal('magic_link'), email: emailSchema, ...base }),
  z.object({ method: z.literal('sms'), phone: z.string().trim().min(4), ...base }),
]);

export async function POST(request: Request): Promise<Response> {
  try {
    await enforceRateLimit(`signup:ip:${clientIp(request)}`, { max: 10, windowSeconds: 3600 });

    const body = bodySchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const phone = body.method === 'sms' ? normalizePhone(body.phone) : null;
    if (body.method === 'sms' && !phone) throw new ApiError('phone_invalid', 400);
    const email = 'email' in body ? body.email : null;
    const identifier = email ?? phone!;

    await enforceRateLimit(`signup:id:${identifier}`, { max: 5, windowSeconds: 3600 });

    const invite = await validateInviteCode(admin, body.inviteCode);
    if (!invite.ok) {
      throw new ApiError(invite.code, invite.code === 'invite_used' ? 409 : 400);
    }

    // One canonical account (§9): if this identifier already has an account,
    // never create a second one. Passwordless methods converge into sign-in;
    // the password method points at sign-in explicitly.
    let existing = admin.from('users').select('id, status').limit(1);
    existing = email ? existing.eq('email', email) : existing.eq('phone', phone!);
    const { data: existingRows } = await existing;
    const existingUser = existingRows?.[0];

    if (existingUser) {
      if (body.method === 'password') throw new ApiError('already_registered', 409);
      if (body.method === 'magic_link') {
        await sendAuthLink(admin, { kind: 'magiclink', email: email! }, '/onboarding');
        return apiNotice('magic_link_sent');
      }
      const supabase = await getSupabaseServer();
      await sendPhoneOtp(supabase, phone!, { shouldCreateUser: false });
      return apiNotice('otp_sent');
    }

    await issueSignupGrant(admin, {
      ...(email ? { email } : { phone: phone! }),
      inviteId: invite.invite.id,
    });

    if (body.method === 'password') {
      const verdict = await validatePassword(body.password);
      if (!verdict.ok) throw new ApiError(verdict.code, 400);

      // generateLink(signup) creates the (unconfirmed) user — the gate
      // trigger consumes the grant. Consents are recorded BEFORE the
      // fallible email send so a provider outage can never leave an account
      // without its §12 records; a failed send is recoverable via a fresh
      // magic link (the account now exists).
      const minted = await mintAuthLink(
        admin,
        { kind: 'signup', email: email!, password: body.password },
        '/onboarding',
      );
      if (minted.userId) await recordSignupConsents(admin, minted.userId);
      await getEmailProvider().send(minted.outgoing);
      return apiNotice('confirm_email_sent');
    }

    if (body.method === 'magic_link') {
      const { data: created, error } = await admin.auth.admin.createUser({ email: email! });
      if (error || !created.user) {
        throw new Error(`createUser(email) failed: ${error?.message}`);
      }
      await recordSignupConsents(admin, created.user.id);
      await sendAuthLink(admin, { kind: 'magiclink', email: email! }, '/onboarding');
      return apiNotice('confirm_email_sent');
    }

    // sms
    const { data: created, error } = await admin.auth.admin.createUser({ phone: phone! });
    if (error || !created.user) {
      throw new Error(`createUser(phone) failed: ${error?.message}`);
    }
    await recordSignupConsents(admin, created.user.id);
    const supabase = await getSupabaseServer();
    await sendPhoneOtp(supabase, phone!, { shouldCreateUser: false });
    return apiNotice('otp_sent');
  } catch (error) {
    return handleApiError(error);
  }
}
