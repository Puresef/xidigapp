import { z } from 'zod';

import {
  CANDIDATE_ASK_MAX,
  CANDIDATE_NAME_MAX,
  CANDIDATE_ONE_LINER_MAX,
  CANDIDATE_PROBLEM_MAX,
  CANDIDATE_SOLUTION_MAX,
  CANDIDATE_STATUS_REASON_MAX,
  CANDIDATE_TEAM_MAX,
  CANDIDATE_TRACTION_MAX,
  INTEREST_MESSAGE_MAX,
  REVIEW_NOTES_MAX,
  RUBRIC_SCORE_MAX,
  RUBRIC_SCORE_MIN,
} from '@/lib/capital/constants';

/**
 * Capital / Maal input validation (§10/§12/§17). Every lifecycle transition is
 * server-driven: clients never send status, submitted_at, decided_at, rubric
 * aggregates or vote-window columns. Status only moves through the dedicated
 * submit/decision endpoints; content edits go through create/update. Enum values
 * mirror the DB enums (candidate_status / candidate_visibility / vote_choice /
 * interest_type) EXACTLY — a divergence would surface as a raw PG error.
 */

// --- shared enums (match the DB enum labels exactly) ------------------------

/** candidate_visibility. */
export const candidateVisibilitySchema = z.enum(['all_members', 'reviewers_only']);

/**
 * candidate_status values a REVIEWER may set via the decision endpoint. draft
 * and submitted are reached through create + submit, not a decision, so they are
 * intentionally excluded here.
 */
export const decisionStatusSchema = z.enum(['in_review', 'approved', 'parked', 'declined']);

/** vote_choice. */
export const voteChoiceSchema = z.enum(['approve', 'reject']);

/** interest_type. */
export const interestTypeSchema = z.enum(['help', 'cosign', 'invest']);

const rubricScore = z.number().int().min(RUBRIC_SCORE_MIN).max(RUBRIC_SCORE_MAX);

// --- create (from a draft/promotion, or a fresh candidate) ------------------

export const candidateCreateSchema = z.object({
  name: z.string().trim().min(1).max(CANDIDATE_NAME_MAX),
  oneLiner: z.string().trim().min(1).max(CANDIDATE_ONE_LINER_MAX).optional(),
  labId: z.string().uuid(),
});

export type CandidateCreateInput = z.infer<typeof candidateCreateSchema>;

// --- update (content fields + art + visibility) -----------------------------
// nullable → allow clearing an optional pitch section; all optional so a PATCH
// can touch a single field. `.refine` blocks an empty body.

export const candidateUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(CANDIDATE_NAME_MAX).optional(),
    oneLiner: z.string().trim().max(CANDIDATE_ONE_LINER_MAX).nullable().optional(),
    problem: z.string().trim().max(CANDIDATE_PROBLEM_MAX).nullable().optional(),
    solution: z.string().trim().max(CANDIDATE_SOLUTION_MAX).nullable().optional(),
    traction: z.string().trim().max(CANDIDATE_TRACTION_MAX).nullable().optional(),
    team: z.string().trim().max(CANDIDATE_TEAM_MAX).nullable().optional(),
    ask: z.string().trim().max(CANDIDATE_ASK_MAX).nullable().optional(),
    visibility: candidateVisibilitySchema.optional(),
    /** media_uploads id (kind candidate_logo) — attached after scan check. */
    logoMediaId: z.string().uuid().nullable().optional(),
    /** media_uploads id (kind candidate_cover) — attached after scan check. */
    coverMediaId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });

export type CandidateUpdateInput = z.infer<typeof candidateUpdateSchema>;

// --- submit (draft → submitted; no body) ------------------------------------

export const candidateSubmitSchema = z.object({}).strict();

export type CandidateSubmitInput = z.infer<typeof candidateSubmitSchema>;

// --- decision (reviewer-only status transition) -----------------------------

export const candidateDecisionSchema = z.object({
  status: decisionStatusSchema,
  statusReason: z.string().trim().max(CANDIDATE_STATUS_REASON_MAX).optional(),
});

export type CandidateDecisionInput = z.infer<typeof candidateDecisionSchema>;

// --- reviewer rubric review -------------------------------------------------
// Every criterion is optional so a reviewer can fill the rubric incrementally.

export const candidateReviewSchema = z
  .object({
    teamScore: rubricScore.optional(),
    tractionScore: rubricScore.optional(),
    feasibilityScore: rubricScore.optional(),
    notes: z.string().trim().max(REVIEW_NOTES_MAX).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to review' });

export type CandidateReviewInput = z.infer<typeof candidateReviewSchema>;

// --- Supporter governance vote ----------------------------------------------

export const candidateVoteSchema = z.object({
  vote: voteChoiceSchema,
});

export type CandidateVoteInput = z.infer<typeof candidateVoteSchema>;

// --- interest (help / cosign / invest) --------------------------------------
// help + cosign: any member, all regions, never gated. invest: region-gate
// required — the route reads the gate; `attested` here is the attestation the
// gate consumes (geo + profile country come from the request/profile, not body).

export const candidateInterestSchema = z.object({
  type: interestTypeSchema,
  message: z.string().trim().max(INTEREST_MESSAGE_MAX).optional(),
  /** Only meaningful for type='invest'; the Somalia self-attestation checkbox. */
  attested: z.boolean().optional(),
});

export type CandidateInterestInput = z.infer<typeof candidateInterestSchema>;

// --- fund-first invest intent (candidate_id = null) -------------------------
// The Maalgeli CTA opens the Xidig Venture Fund first; attestation is REQUIRED
// because this is invest intent and always region-gated.

export const fundInterestSchema = z.object({
  message: z.string().trim().max(INTEREST_MESSAGE_MAX).optional(),
  attested: z.boolean(),
});

export type FundInterestInput = z.infer<typeof fundInterestSchema>;

// --- gate evaluation (drives whether Maalgeli UI shows) ---------------------

export const gateEvaluateSchema = z.object({
  attested: z.boolean(),
});

export type GateEvaluateInput = z.infer<typeof gateEvaluateSchema>;

// --- list query -------------------------------------------------------------

export const candidateListQuerySchema = z.object({
  labId: z.string().uuid().optional(),
  status: z.enum(['draft', 'submitted', 'in_review', 'approved', 'parked', 'declined']).optional(),
  cursor: z.string().optional(),
});

export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;
