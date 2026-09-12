import { z } from 'zod';

import {
  BOARD_COLUMNS,
  GOAL_STATEMENT_MAX,
  GOAL_UNIT_MAX,
  LEDGER_MAX_DAYS,
  TASK_TITLE_MAX,
  WEIGHT_MAX,
  WORK_EVENT_TYPES,
  WORK_NOTE_MAX,
  WORK_QUANTITY_MAX,
  WORK_QUANTITY_MIN,
  WORKSTREAM_NAME_MAX,
} from '@/lib/maal/constants';

/**
 * Maal input validation (F2 §5). Same posture as lib/labs/schemas.ts: the
 * client sends intent, never state. In particular it never sends
 *
 *   * `unit_weight` or `units` — the server resolves the weight from the
 *     venture's current scheme and derives units from it (a client-sent weight
 *     is a client-sent share, and the ledger is the one place that must not be
 *     forgeable);
 *   * `seq`, `prev_hash`, `hash` — the DB trigger assigns the chain;
 *   * `space_mode`, `venture_since`, `demoted_at`, `demotion_warned_at` —
 *     promotion is its own endpoint and demotion has no endpoint at all
 *     (system-role only, ruling 2).
 *
 * There is deliberately no pledge schema. Pledging is a built-and-disabled
 * control, and a body for it would imply a capability escrow does not give us.
 */

const workEventTypeSchema = z.enum(WORK_EVENT_TYPES);

// --- promotion: Warshad -> Maal ---------------------------------------------

/**
 * The goal may be filled in-request (mirrors promoteSchema's charter patch):
 * a Warshad that already declared one promotes with an empty body, one that
 * has not declares it here. The remaining preconditions — a complete charter
 * and at least one workstream with a named owner — are stored state, checked in
 * promoteToVenture().
 */
export const venturePromoteSchema = z.object({
  goalStatement: z.string().trim().min(1).max(GOAL_STATEMENT_MAX).optional(),
  goalUnit: z.string().trim().min(1).max(GOAL_UNIT_MAX).optional(),
  goalTarget: z.number().int().positive().optional(),
});

export type VenturePromoteInput = z.infer<typeof venturePromoteSchema>;

/** Goal edits after promotion (the 7b meter). `goalProgress` is member-set. */
export const ventureGoalSchema = z
  .object({
    goalStatement: z.string().trim().min(1).max(GOAL_STATEMENT_MAX).nullable().optional(),
    goalUnit: z.string().trim().min(1).max(GOAL_UNIT_MAX).nullable().optional(),
    goalTarget: z.number().int().positive().nullable().optional(),
    goalProgress: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');

export type VentureGoalInput = z.infer<typeof ventureGoalSchema>;

/** The 7b member-set toggles. Xidig does not choose these — the members do. */
export const ventureVisibilitySchema = z
  .object({
    ledgerVisibility: z.enum(['members', 'leads']).optional(),
    hoursVisibility: z.enum(['members', 'leads']).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');

export type VentureVisibilityInput = z.infer<typeof ventureVisibilitySchema>;

// --- workstreams (7b "Qaybaha shaqada") -------------------------------------

export const workstreamCreateSchema = z.object({
  name: z.string().trim().min(1).max(WORKSTREAM_NAME_MAX),
  /** null = an open seat, which is a first-class state, not a missing value. */
  ownerUserId: z.string().uuid().nullish(),
  status: z.enum(['active', 'waiting']).default('active'),
  position: z.number().int().min(0).max(999).optional(),
});

export type WorkstreamCreateInput = z.infer<typeof workstreamCreateSchema>;

export const workstreamUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(WORKSTREAM_NAME_MAX).optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    status: z.enum(['active', 'waiting']).optional(),
    position: z.number().int().min(0).max(999).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');

export type WorkstreamUpdateInput = z.infer<typeof workstreamUpdateSchema>;

// --- tasks (7c board) --------------------------------------------------------

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(TASK_TITLE_MAX),
  workstreamId: z.string().uuid().nullish(),
  /** Set only when a task is created already claimed by its author. */
  assigneeUserId: z.string().uuid().nullish(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(TASK_TITLE_MAX).optional(),
    workstreamId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'nothing to update');

export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

/**
 * A board move names the destination only. Which moves are legal, and which of
 * them the caller is recused from, is server state — see TASK_TRANSITIONS and
 * transitionTask().
 */
export const taskTransitionSchema = z.object({
  status: z.enum(['open', 'claimed', 'submitted', 'attested', 'verified']),
});

export type TaskTransitionInput = z.infer<typeof taskTransitionSchema>;

// --- the ledger --------------------------------------------------------------

/**
 * A self-logged contribution. `occurredAt` is the member's own statement of
 * WHEN the work happened — the m5 offline queue replays a log hours later and
 * the true timestamp is the one that must survive, never the send time.
 */
export const contributionLogSchema = z.object({
  type: workEventTypeSchema,
  quantity: z.number().min(WORK_QUANTITY_MIN).max(WORK_QUANTITY_MAX),
  taskId: z.string().uuid().nullish(),
  note: z.string().trim().min(1).max(WORK_NOTE_MAX).nullish(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export type ContributionLogInput = z.infer<typeof contributionLogSchema>;

/**
 * A correction. The reason is required and is not decoration: the reversal row
 * renders as "Celin: {name} · {n} saac ({reason})", so an unexplained reversal
 * would render as an unexplained hole in someone's share.
 */
export const contributionReversalSchema = z.object({
  reason: z.string().trim().min(1).max(WORK_NOTE_MAX),
});

export type ContributionReversalInput = z.infer<typeof contributionReversalSchema>;

/**
 * A voted weight scheme. `decisionId` is REQUIRED: 7d says changing the weights
 * is a decision the members vote on and that it goes into the decision log, so
 * a scheme with no decision behind it must not be insertable.
 */
const weightValue = z.number().int().min(0).max(WEIGHT_MAX);

export const weightSchemeSchema = z.object({
  weights: z.object({
    hours: weightValue,
    code: weightValue,
    design: weightValue,
    intro: weightValue,
    money: weightValue,
  }),
  decisionId: z.string().uuid(),
});

export type WeightSchemeInput = z.infer<typeof weightSchemeSchema>;

// --- capital (7f) ------------------------------------------------------------

// No capital-need input schema: declaring a need is PAUSED (owner ruling,
// 12 Sep) while the capital pathway is under review, so no body is accepted.

// --- read queries ------------------------------------------------------------

/** 7a filter chips: Dhammaan / Maal / Warshad / Kuwa aan ku jiro. */
export const ventureIndexQuerySchema = z.object({
  filter: z.enum(['all', 'ventures', 'labs', 'mine']).default('all'),
  cursor: z.string().optional(),
});

export type VentureIndexQuery = z.infer<typeof ventureIndexQuerySchema>;

export const boardQuerySchema = z.object({
  workstreamId: z.string().uuid().optional(),
  column: z.enum(BOARD_COLUMNS).optional(),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

/** 7g sheet filters — the SAME filters the desktop table takes (ruling 1). */
export const ledgerQuerySchema = z.object({
  memberId: z.string().uuid().optional(),
  type: workEventTypeSchema.optional(),
  days: z.coerce.number().int().min(1).max(LEDGER_MAX_DAYS).optional(),
});

export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
