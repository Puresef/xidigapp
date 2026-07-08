import { z } from 'zod';

/**
 * Zod schemas shared across the Phase 6 report / moderation / appeal /
 * verification / account-lifecycle routes. Kept in one place so the report
 * target allowlist, the action vocab, and the lifecycle transitions can't drift
 * between the submit route, the mod queue, and the tests.
 */

// Reportable surfaces (widened from the Phase-3 DM-only allowlist to every
// surface Phase 6 moderates). The DB reports.target_type is the broad
// entity_type enum; this is the app-layer allowlist of what members may report.
export const REPORT_TARGET_TYPES = [
  'user',
  'profile',
  'conversation',
  'message',
  'post',
  'comment',
  'listing',
  'lab_update',
  'candidate',
] as const;

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'impersonation',
  'fraud_or_scam',
  'inappropriate_content',
  'misinformation',
  'other',
] as const;

export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

// Mod queue decision. 'no_violation' resolves the report leaving content
// untouched; 'dismiss' marks a spam/duplicate report dismissed; the rest run
// through applyModAction. `resolution` is the §19 visible-to-reporter outcome;
// `reason` is the internal mod note (never shown to the target).
export const reportDecisionSchema = z.object({
  action: z.enum([
    'no_violation',
    'remove_content',
    'hide_content',
    'warn_user',
    'suspend_user',
    'dismiss',
  ]),
  resolution: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(2000).optional(),
});

// Claim / release a report for review (assigned_to_user_id triage).
export const reportAssignSchema = z.object({ claim: z.boolean() });

// --- Appeals (§19) ----------------------------------------------------------
export const appealSubmitSchema = z.object({
  modActionId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

// upheld = the original action STANDS (appeal denied);
// overturned = the original action is REVERSED (content restored / user unsuspended).
// A "partially modified" outcome is an `overturned` followed by a lighter
// replacement mod_action, recorded in decision notes (no enum change needed).
export const appealDecisionSchema = z.object({
  outcome: z.enum(['upheld', 'overturned']),
  decisionNotes: z.string().trim().max(2000).optional(),
});

// --- Verification (§14) -----------------------------------------------------
export const verificationRequestSchema = z
  .object({
    type: z.enum(['identity', 'business']),
    listingId: z.string().uuid().optional(),
    // Recording consent (§14). Hard-gated: the request cannot proceed to a
    // recorded call without it.
    consentGiven: z.boolean(),
  })
  .refine((v) => v.type !== 'business' || Boolean(v.listingId), {
    message: 'listingId is required for business verification',
    path: ['listingId'],
  });

// Schedule the video call: store the external booking link + optional slot.
export const verificationScheduleSchema = z.object({
  bookingUrl: z.string().url().max(500),
  scheduledAt: z.string().datetime().optional(),
});

// Verifier decision. 'more_info' keeps the request open (info_requested_at) and
// notifies the member; approve/decline are terminal.
export const verificationDecisionSchema = z.object({
  decision: z.enum(['approved', 'declined', 'more_info']),
  notes: z.string().trim().max(2000).optional(),
});

// Community Verified (§14): a member vouches for another verified member.
export const vouchSchema = z.object({ voucheeUserId: z.string().uuid() });

// Admin manages the verifier roster.
export const verifierGrantSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['grant', 'revoke']),
  note: z.string().trim().max(500).optional(),
});

// --- Account lifecycle (§19) ------------------------------------------------
export const accountActionSchema = z.object({
  action: z.enum(['deactivate', 'reactivate', 'request_deletion', 'cancel_deletion']),
});

// Admin/mod direct suspension (also reachable via a report decision).
export const suspendSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['suspend', 'unsuspend']),
  reason: z.string().trim().max(2000).optional(),
});
