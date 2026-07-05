import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { env } from '@/env';
import { ApiError } from '@/lib/api';
import { type OutgoingEmail } from '@/lib/email/provider';
import { sendEmailChecked } from '@/lib/email/send';
import {
  emailChangeEmail,
  magicLinkEmail,
  passwordResetEmail,
  signupConfirmEmail,
} from '@/lib/email/templates';

import { recordAuthToken } from './tokens';

/**
 * Self-sent auth links. The app (not Supabase SMTP) emails every auth link:
 * generateLink() mints the token, we record its issued-at (10-minute
 * app-side expiry for magiclink/signup/email_change; recovery rides GoTrue's
 * 60-minute setting), and the email goes out through the provider
 * abstraction with our §27-voiced copy.
 *
 * The link always points at OUR /auth/confirm — never at the Supabase verify
 * URL — so expiry enforcement and error UX stay in the app.
 */

/** Open-redirect guard for post-auth destinations. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

function confirmUrl(tokenHash: string, verifyType: string, next: string): string {
  const url = new URL('/auth/confirm', env.APP_URL);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', verifyType);
  url.searchParams.set('next', next);
  return url.toString();
}

export type AuthLinkKind =
  | { kind: 'magiclink'; email: string }
  | { kind: 'signup'; email: string; password: string }
  | { kind: 'recovery'; email: string }
  | { kind: 'email_change'; currentEmail: string; newEmail: string };

export interface MintedAuthLink {
  /** The user the link targets (for signup links, the freshly created user). */
  userId: string | undefined;
  /** The rendered email, ready to hand to the provider. */
  outgoing: OutgoingEmail;
}

/**
 * Mint + record one auth link WITHOUT sending it. Callers that must do work
 * between account creation and the (fallible) email send — recording §12
 * consents, most importantly — mint first, then send. Throws
 * ApiError('already_registered') when a signup link targets an existing
 * account; other GoTrue failures bubble as 500s (they are our
 * misconfiguration, not user error).
 */
export async function mintAuthLink(
  admin: SupabaseClient<Database>,
  link: AuthLinkKind,
  next?: string,
): Promise<MintedAuthLink> {
  const destination = safeNextPath(next);

  const { data, error } =
    link.kind === 'signup'
      ? await admin.auth.admin.generateLink({
          type: 'signup',
          email: link.email,
          password: link.password,
        })
      : link.kind === 'email_change'
        ? await admin.auth.admin.generateLink({
            type: 'email_change_new',
            email: link.currentEmail,
            newEmail: link.newEmail,
          })
        : await admin.auth.admin.generateLink({ type: link.kind, email: link.email });

  if (error || !data.properties) {
    const message = error?.message ?? '';
    if (link.kind === 'signup' && /already|registered|exists/i.test(message)) {
      throw new ApiError('already_registered', 409);
    }
    throw new Error(`generateLink(${link.kind}) failed: ${message || 'no properties returned'}`);
  }

  const { hashed_token, email_otp, verification_type } = data.properties;
  // GoTrue names email-change links email_change_current/_new; verifyOtp
  // expects the single type 'email_change'.
  const verifyType = verification_type.startsWith('email_change') ? 'email_change' : verification_type;

  const recipient = link.kind === 'email_change' ? link.newEmail : link.email;
  const url = confirmUrl(hashed_token, verifyType, destination);

  await recordAuthToken(admin, {
    tokenHash: hashed_token,
    email: recipient,
    type: verifyType,
    userId: data.user?.id,
  });

  // Numeric fallback (deliverability): magic-link and signup emails carry
  // the 6-digit companion code for clients that mangle/pre-fetch links —
  // verified on the same screen via /api/auth/email-otp/verify. Recovery
  // stays link-only (the reset form needs the link's recovery session);
  // email_change stays link-only (the click is the ownership proof).
  const outgoing =
    link.kind === 'magiclink'
      ? magicLinkEmail(recipient, url, email_otp)
      : link.kind === 'signup'
        ? signupConfirmEmail(recipient, url, email_otp)
        : link.kind === 'recovery'
          ? passwordResetEmail(recipient, url)
          : emailChangeEmail(recipient, url);

  return { userId: data.user?.id, outgoing };
}

/** Mint + record + send in one step, for flows with nothing between the two. */
export async function sendAuthLink(
  admin: SupabaseClient<Database>,
  link: AuthLinkKind,
  next?: string,
): Promise<string | undefined> {
  const minted = await mintAuthLink(admin, link, next);
  await sendEmailChecked(admin, minted.outgoing);
  return minted.userId;
}
