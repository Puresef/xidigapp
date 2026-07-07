import { z } from 'zod';

import {
  ARTIFACT_DESCRIPTION_MAX,
  ARTIFACT_TITLE_MAX,
  ARTIFACT_URL_MAX,
  CANDIDATE_NAME_MAX,
  CANDIDATE_ONE_LINER_MAX,
  CHARTER_HYPOTHESIS_MAX,
  CHARTER_PROBLEM_MAX,
  CHARTER_SUCCESS_MAX,
  DECISION_CONTEXT_MAX,
  DECISION_TEXT_MAX,
  DECISION_TITLE_MAX,
  LAB_NAME_MAX,
  LAB_SLUG_MAX,
  LAB_SUMMARY_MAX,
  PINNED_LABS_MAX,
  SKILL_MAX,
  SKILLS_PER_LAB_MAX,
  SPRINT_LENGTH_MAX,
  SPRINT_LENGTH_MIN,
  UPDATE_BODY_MAX,
  UPDATE_TITLE_MAX,
} from '@/lib/labs/constants';

/**
 * Labs / Spaces input validation (§16). Everything a Space's lifecycle needs is
 * server-driven — clients never send status columns, promoted_at, dormant_since
 * or last_activity_at. Mode is set at creation and thereafter changes ONLY
 * through the promote endpoint (promote-only ladder, no demotion), never a
 * plain settings PATCH.
 */

const httpUrl = z
  .string()
  .trim()
  .max(ARTIFACT_URL_MAX)
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'must be an http(s) URL' },
  );

/** Matches the DB CHECK labs_slug_format (lowercase, digits, dashes; no edge dash). */
export const LAB_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,59}[a-z0-9])?$/;

export const labSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(LAB_SLUG_MAX)
  .regex(LAB_SLUG_REGEX, 'lowercase letters, numbers and dashes');

export const skillSchema = z.string().trim().min(1).max(SKILL_MAX);

const visibilitySchema = z.enum(['private', 'members', 'public']);
const joinModeSchema = z.enum(['open', 'request', 'invite']);

// --- create -----------------------------------------------------------------

const createBase = {
  name: z.string().trim().min(1).max(LAB_NAME_MAX),
  slug: labSlugSchema,
  summary: z.string().trim().min(1).max(LAB_SUMMARY_MAX).optional(),
  visibility: visibilitySchema.default('members'),
  joinMode: joinModeSchema.default('request'),
  skills: z.array(skillSchema).max(SKILLS_PER_LAB_MAX).optional(),
  tagIds: z.array(z.string().uuid()).max(10).optional(),
};

const charterFields = {
  problemStatement: z.string().trim().min(1).max(CHARTER_PROBLEM_MAX),
  hypothesis: z.string().trim().min(1).max(CHARTER_HYPOTHESIS_MAX),
  successDefinition: z.string().trim().min(1).max(CHARTER_SUCCESS_MAX),
  sprintLengthWeeks: z.number().int().min(SPRINT_LENGTH_MIN).max(SPRINT_LENGTH_MAX).optional(),
  sprintDeadline: z.string().datetime().optional(),
};

/**
 * A Space is created as a Club (casual, free) or a Lab (charter-backed). A Lab
 * requires the three charter fields up front AND the create_lab capability
 * (enforced in the route); a Club needs neither.
 */
export const labCreateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('club'), ...createBase }),
  z.object({ mode: z.literal('lab'), ...createBase, ...charterFields }),
]);

export type LabCreateInput = z.infer<typeof labCreateSchema>;

// --- settings (mode is NOT here — promote-only ladder) ----------------------

export const labSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(LAB_NAME_MAX).optional(),
    summary: z.string().trim().max(LAB_SUMMARY_MAX).nullable().optional(),
    visibility: visibilitySchema.optional(),
    memberListVisibility: visibilitySchema.optional(),
    joinMode: joinModeSchema.optional(),
    isListed: z.boolean().optional(),
    isSupporterOnly: z.boolean().optional(),
    // Charter edits (a Club prepping to promote, or a Lab refining its charter).
    problemStatement: z.string().trim().max(CHARTER_PROBLEM_MAX).nullable().optional(),
    hypothesis: z.string().trim().max(CHARTER_HYPOTHESIS_MAX).nullable().optional(),
    successDefinition: z.string().trim().max(CHARTER_SUCCESS_MAX).nullable().optional(),
    sprintLengthWeeks: z
      .number()
      .int()
      .min(SPRINT_LENGTH_MIN)
      .max(SPRINT_LENGTH_MAX)
      .nullable()
      .optional(),
    sprintDeadline: z.string().datetime().nullable().optional(),
    stage: z.enum(['idea', 'building', 'validating', 'launched']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });

export type LabSettingsInput = z.infer<typeof labSettingsSchema>;

// --- promotion (Club -> Lab -> Candidate) -----------------------------------

export const promoteSchema = z.discriminatedUnion('target', [
  // Club -> Lab: uses the stored charter; optional fields fill it in-request.
  z.object({
    target: z.literal('lab'),
    problemStatement: z.string().trim().min(1).max(CHARTER_PROBLEM_MAX).optional(),
    hypothesis: z.string().trim().min(1).max(CHARTER_HYPOTHESIS_MAX).optional(),
    successDefinition: z.string().trim().min(1).max(CHARTER_SUCCESS_MAX).optional(),
    sprintLengthWeeks: z.number().int().min(SPRINT_LENGTH_MIN).max(SPRINT_LENGTH_MAX).optional(),
  }),
  // Lab -> Venture Candidate: a handoff MARKER only (no Capital in Phase 4).
  z.object({
    target: z.literal('candidate'),
    name: z.string().trim().min(1).max(CANDIDATE_NAME_MAX),
    oneLiner: z.string().trim().min(1).max(CANDIDATE_ONE_LINER_MAX).optional(),
  }),
]);

export type PromoteInput = z.infer<typeof promoteSchema>;

// --- content ----------------------------------------------------------------

export const updateCreateSchema = z.object({
  title: z.string().trim().min(1).max(UPDATE_TITLE_MAX).optional(),
  body: z.string().trim().min(1).max(UPDATE_BODY_MAX),
  /** When set, cross-post to the linked Space of an accepted collaboration. */
  collaborationId: z.string().uuid().optional(),
});

export type UpdateCreateInput = z.infer<typeof updateCreateSchema>;

export const artifactCreateSchema = z.object({
  title: z.string().trim().min(1).max(ARTIFACT_TITLE_MAX),
  url: httpUrl,
  description: z.string().trim().max(ARTIFACT_DESCRIPTION_MAX).optional(),
});

export type ArtifactCreateInput = z.infer<typeof artifactCreateSchema>;

export const decisionCreateSchema = z.object({
  title: z.string().trim().min(1).max(DECISION_TITLE_MAX),
  context: z.string().trim().max(DECISION_CONTEXT_MAX).optional(),
  decision: z.string().trim().min(1).max(DECISION_TEXT_MAX),
});

export type DecisionCreateInput = z.infer<typeof decisionCreateSchema>;

// --- membership -------------------------------------------------------------

export const memberActionSchema = z.discriminatedUnion('action', [
  // Caller joins/requests (open Spaces join instantly; request Spaces queue).
  z.object({ action: z.literal('join') }),
  // Caller leaves.
  z.object({ action: z.literal('leave') }),
  // Lead/admin responds to a pending request.
  z.object({
    action: z.literal('respond'),
    userId: z.string().uuid(),
    decision: z.enum(['accept', 'decline']),
  }),
  // Lead/admin invites a member directly.
  z.object({
    action: z.literal('invite'),
    userId: z.string().uuid(),
    role: z.enum(['core', 'member', 'observer']).default('member'),
  }),
  // Lead/admin changes a member's role.
  z.object({
    action: z.literal('set_role'),
    userId: z.string().uuid(),
    role: z.enum(['core', 'member', 'observer']),
  }),
  // Lead/admin removes a member.
  z.object({ action: z.literal('remove'), userId: z.string().uuid() }),
]);

export type MemberActionInput = z.infer<typeof memberActionSchema>;

// --- pins (profile featured Labs) -------------------------------------------

export const pinSchema = z.object({
  position: z.number().int().min(1).max(PINNED_LABS_MAX).optional(),
});

export type PinInput = z.infer<typeof pinSchema>;

// --- inter-lab collaboration ------------------------------------------------

export const collaborationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), targetLabId: z.string().uuid() }),
  z.object({
    action: z.literal('respond'),
    collaborationId: z.string().uuid(),
    decision: z.enum(['accept', 'decline']),
  }),
  z.object({ action: z.literal('end'), collaborationId: z.string().uuid() }),
]);

export type CollaborationActionInput = z.infer<typeof collaborationActionSchema>;

// --- skill needs ------------------------------------------------------------

export const skillNeedSchema = z.object({ skill: skillSchema });

// --- list query -------------------------------------------------------------

export const labListQuerySchema = z.object({
  mode: z.enum(['club', 'lab']).optional(),
  mine: z.string().optional(),
  cursor: z.string().optional(),
});
