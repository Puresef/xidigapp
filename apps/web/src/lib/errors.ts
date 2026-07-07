import type { MessageKey, TranslateParams, Translator } from '@xidig/i18n';

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';
import {
  COMMENT_LIMIT_FREE,
  IMAGE_MAX_MB,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POST_LIMIT_FREE,
} from '@/lib/plaza/constants';

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
  email_undeliverable: {
    messageKey: 'error.emailUndeliverable',
    cta: { labelKey: 'auth.methodSms', href: '/signin?method=sms' },
  },

  // --- Profile & directory (§27) ---------------------------------------------------
  handle_taken: { messageKey: 'error.handleTaken' },
  handle_invalid: { messageKey: 'error.handleInvalid' },
  profile_incomplete: {
    messageKey: 'error.profileIncomplete',
    cta: { labelKey: 'onboarding.completeProfile', href: '/settings/profile' },
  },
  duplicate_listing: { messageKey: 'error.duplicateListing' },
  listing_limit: { messageKey: 'error.listingLimit' },

  // --- Plaza (§27 Plaza block + §15/§26 mechanics) -----------------------------------
  post_limit: {
    messageKey: 'error.postLimit',
    params: { max: POST_LIMIT_FREE },
  },
  comment_limit: {
    messageKey: 'error.commentLimit',
    params: { max: COMMENT_LIMIT_FREE },
  },
  image_too_large: {
    messageKey: 'error.imageTooLarge',
    params: { maxMb: IMAGE_MAX_MB },
  },
  image_invalid: { messageKey: 'error.imageInvalid' },
  image_moderation_blocked: { messageKey: 'error.imageModerationBlocked' },
  ask_already_answered: { messageKey: 'error.askAlreadyAnswered' },
  ask_not_open: { messageKey: 'error.askNotOpen' },
  ask_credit_invalid: { messageKey: 'error.askCreditInvalid' },
  poll_closed: { messageKey: 'error.pollClosed' },
  poll_options_invalid: {
    messageKey: 'error.pollOptionsInvalid',
    params: { min: POLL_OPTIONS_MIN, max: POLL_OPTIONS_MAX },
  },
  media_not_ready: { messageKey: 'error.mediaNotReady' },
  playbook_invalid: { messageKey: 'error.playbookInvalid' },
  tag_invalid: { messageKey: 'error.tagInvalid' },
  tag_limit: { messageKey: 'error.tagLimit' },
  post_not_editable: { messageKey: 'error.postNotEditable' },

  // --- DMs / Fariimo (§27 DMs block) -------------------------------------------------
  dm_blocked: { messageKey: 'error.dmBlocked' },
  dm_not_accepted: { messageKey: 'error.dmNotAccepted' },

  // --- Labs / Warshad (§27 Labs block) -----------------------------------------------
  not_supporter: {
    messageKey: 'error.notSupporter',
    cta: { labelKey: 'action.upgradeSupporter', href: '/settings' },
  },
  charter_incomplete: { messageKey: 'error.charterIncomplete' },
  lab_slug_taken: { messageKey: 'error.labSlugTaken' },
  lab_join_closed: { messageKey: 'error.labJoinClosed' },
  lab_already_member: { messageKey: 'error.labAlreadyMember' },
  lab_collab_invalid: { messageKey: 'error.labCollabInvalid' },
  pinned_full: { messageKey: 'error.pinnedFull' },

  // --- Phase 4.5 experience expansion (media, pins, drafts) --------------------------
  // Listing photos + post images require alt text (accessibility + Lite mode).
  image_alt_required: { messageKey: 'error.imageAltRequired' },
  // A profile pin target doesn't exist, isn't readable to the caller, or was
  // sent twice. Deliberately vague — never reveal which item failed.
  pin_target_invalid: { messageKey: 'error.pinTargetInvalid' },
  // Draft cap (10/user) reached on POST /api/me/drafts.
  draft_limit: { messageKey: 'error.draftLimit' },

  // --- Capital / Maal (§27 Capital block) --------------------------------------------
  // A mod/admin recused because they're a member of the Candidate's Lab (§17
  // fairness). NOT the same as not_a_reviewer — the caller IS a reviewer.
  reviewer_conflict: { messageKey: 'error.reviewerConflict' },
  // Reviewers-only Candidate, surfaced to the UI when it wants to distinguish
  // the reviewers-only case from a plain not_found (RLS otherwise returns 404).
  candidate_not_visible: { messageKey: 'error.candidateNotVisible' },
  // Caller is not a reviewer at all (not mod/admin) hitting reviews/decision.
  not_a_reviewer: { messageKey: 'error.notAReviewer' },
  // Submit/decision/review on a Candidate that isn't a submittable draft.
  candidate_not_submittable: { messageKey: 'error.candidateNotSubmittable' },
  // Governance vote cast/retract outside the 7-day window.
  vote_closed: { messageKey: 'error.voteClosed' },

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
  // Phase 3 (Fariimo). §27: "Your message request has been sent…" / "Thanks
  // for the report…" — success-path plain-language copy.
  dm_request_sent: 'messages.requestSent',
  report_submitted: 'messages.reportSubmitted',
  // Phase 4 (Labs). §27: "Your request to join has been sent…" — success-path
  // plain-language copy shown when a request-to-join Space accepts the request.
  lab_join_requested: 'lab.noticeJoinRequested',
  // Phase 5 (Capital). §27: non-Somalia invest attempt falls back to the
  // informational view — a success-path notice, never an error. The Maalgeli
  // UI reads capital.regionGatedNotice; the API returns this on invest/gate.
  capital_region_gated: 'notice.capitalRegionGated',
} as const satisfies Record<string, MessageKey>;

export type NoticeCode = keyof typeof NOTICE_KEYS;
