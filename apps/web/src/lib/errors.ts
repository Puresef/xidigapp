import type { MessageKey, TranslateParams, Translator } from '@xidig/i18n';

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';

/**
 * Plain language error catalog (PRD §27).
 *
 * Every error answers three questions: what happened · why · what to do
 * next. No raw HTTP codes or provider error strings ever reach a user, and
 * where a resolution exists the CTA links straight to it.
 *
 * Copy lives in the @xidig/i18n dictionaries (bilingual, §22) — this module
 * maps stable error codes to message keys + CTAs. API responses resolve the
 * request locale server-side (lib/api.ts); client components resolve the
 * same keys through useT().
 */

export interface PlainErrorDef {
  messageKey: MessageKey;
  /** Interpolation params baked into the definition (e.g. policy limits). */
  params?: TranslateParams;
  cta?: { labelKey: MessageKey; href: string };
}

export const ERROR_DEFS = {
  // --- §27 Auth & access ---------------------------------------------------
  session_expired: {
    messageKey: 'error.sessionExpired',
    cta: { labelKey: 'action.signIn', href: '/signin' },
  },
  magic_link_expired: {
    messageKey: 'error.magicLinkExpired',
    cta: { labelKey: 'action.requestNewLink', href: '/signin?method=magic-link' },
  },
  otp_invalid: {
    messageKey: 'error.otpInvalid',
    cta: { labelKey: 'action.requestNewCode', href: '/signin?method=sms' },
  },
  reset_link_expired: {
    messageKey: 'error.resetLinkExpired',
    cta: { labelKey: 'action.resetPassword', href: '/reset-password' },
  },
  wrong_credentials: {
    messageKey: 'error.wrongCredentials',
    cta: { labelKey: 'action.resetPassword', href: '/reset-password' },
  },
  account_suspended: {
    messageKey: 'error.accountSuspended',
    cta: { labelKey: 'action.appeal', href: '/support/appeal' },
  },
  forbidden: { messageKey: 'error.forbidden' },
  not_found: {
    messageKey: 'error.notFound',
    cta: { labelKey: 'action.goHome', href: '/' },
  },
  server_error: { messageKey: 'error.server' },

  // --- Beta gating -----------------------------------------------------------
  signup_not_allowed: {
    messageKey: 'error.signupNotAllowed',
    cta: { labelKey: 'action.joinWaitlist', href: '/waitlist' },
  },
  invite_invalid: {
    messageKey: 'error.inviteInvalid',
    cta: { labelKey: 'action.joinWaitlist', href: '/waitlist' },
  },
  invite_used: {
    messageKey: 'error.inviteUsed',
    cta: { labelKey: 'action.joinWaitlist', href: '/waitlist' },
  },
  already_registered: {
    messageKey: 'error.alreadyRegistered',
    cta: { labelKey: 'action.signIn', href: '/signin' },
  },
  email_not_confirmed: {
    messageKey: 'error.emailNotConfirmed',
    cta: { labelKey: 'action.requestNewLink', href: '/signin?method=magic-link' },
  },

  // --- Passwords ---------------------------------------------------------------
  password_too_short: {
    messageKey: 'error.passwordTooShort',
    params: { min: PASSWORD_MIN_LENGTH },
  },
  password_too_long: {
    messageKey: 'error.passwordTooLong',
    params: { max: PASSWORD_MAX_BYTES },
  },
  password_breached: { messageKey: 'error.passwordBreached' },
  password_unchanged: { messageKey: 'error.passwordUnchanged' },

  // --- Contact linking ------------------------------------------------------------
  email_taken: {
    messageKey: 'error.emailTaken',
    cta: { labelKey: 'action.signIn', href: '/signin' },
  },
  phone_taken: {
    messageKey: 'error.phoneTaken',
    cta: { labelKey: 'action.signIn', href: '/signin' },
  },
  phone_invalid: { messageKey: 'error.phoneInvalid' },
  sms_unavailable: {
    messageKey: 'error.smsUnavailable',
    cta: { labelKey: 'action.useMagicLink', href: '/signin?method=magic-link' },
  },

  // --- Request hygiene ---------------------------------------------------------------
  rate_limited: { messageKey: 'error.rateLimited' },
  invalid_request: { messageKey: 'error.invalidRequest' },
} as const satisfies Record<string, PlainErrorDef>;

export type ErrorCode = keyof typeof ERROR_DEFS;

/** Wire/UI form of an error: resolved copy in the request locale. */
export interface PlainError {
  code: ErrorCode;
  message: string;
  cta?: { label: string; href: string };
}

export function resolveError(code: ErrorCode, t: Translator): PlainError {
  const def: PlainErrorDef = ERROR_DEFS[code];
  return {
    code,
    message: t(def.messageKey, def.params),
    ...(def.cta ? { cta: { label: t(def.cta.labelKey), href: def.cta.href } } : {}),
  };
}

export function isErrorCode(value: string | null | undefined): value is ErrorCode {
  return typeof value === 'string' && value in ERROR_DEFS;
}

/**
 * Informational (non-error) auth notices — §27 copy the API returns on
 * success paths. Same dictionary-key indirection as errors.
 */
export const NOTICE_KEYS = {
  password_reset_sent: 'auth.resetSent',
  magic_link_sent: 'auth.magicLinkSent',
  otp_sent: 'auth.otpSent',
  confirm_email_sent: 'auth.confirmEmailSent',
  password_updated: 'auth.passwordUpdated',
  waitlist_joined: 'waitlist.joined',
} as const satisfies Record<string, MessageKey>;

export type NoticeCode = keyof typeof NOTICE_KEYS;
