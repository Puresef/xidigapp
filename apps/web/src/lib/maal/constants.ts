import type { Enums } from '@xidig/db';

/**
 * Maal (venture workspace) limits, windows and the seeded weight scheme
 * (F2 §5, frames 7a–7g). Mirrors the DB defaults + CHECK constraints in
 * 20260813000100_maal_venture.sql so validation fails fast in the API with §27
 * copy instead of a raw PG error — the same contract lib/labs/constants.ts
 * holds for Phase 4.
 *
 * Maal is `labs.space_mode = 'venture'`. Warshad is `'lab'`, Koox is `'club'`
 * — and Koox never appears on a Maal surface (ruling 4), which is why the
 * index query below filters on WORK_ORG_MODES rather than on "not a club".
 */

// --- the stage ---------------------------------------------------------------

/** The two staged work organisations. Koox ('club') is deliberately absent. */
export const WORK_ORG_MODES = ['lab', 'venture'] as const satisfies readonly Enums<'space_mode'>[];

// --- the demotion clock (ruling 2) -------------------------------------------

/**
 * DORMANCY_DAYS (28, lib/labs/constants.ts) is unchanged and is the early
 * warning — a marker, never a stage change. These three are the stage-timeout
 * path and mirror the SQL defaults of `warn_timed_out_ventures()` and
 * `demote_timed_out_ventures()`: a Maal idle for 70 days is warned, and
 * returns to Warshad at 84 days — but never sooner than 7 days after the
 * warning went out. Advance notice is a precondition of the demotion, not a
 * courtesy attached to it, which is why the grace period is its own number.
 *
 * PAUSED (owner ruling, 12 Sep): while re-promotion is paused the timeout would
 * be one-way, so the sweep no longer warns or demotes. The numbers stay as the
 * record of the paused rule. The only thing still reading one is the sweep's
 * read-only operator count of Ventures idle past VENTURE_TIMEOUT_DAYS
 * (lib/labs/sweeps.ts), which changes no state and tells no member anything.
 */
export const VENTURE_WARN_DAYS = 70;
export const VENTURE_TIMEOUT_DAYS = 84;
export const VENTURE_WARN_GRACE_DAYS = 7;

// --- the ledger --------------------------------------------------------------

/**
 * `work_event_type`. There is no 'reversal' member: a correction is an ordinary
 * event of the SAME type carrying a negative quantity and `reverses_event_id`
 * (the DB CHECK ties those two together), so a reversal is always readable as
 * the thing it reverses.
 */
export const WORK_EVENT_TYPES = [
  'hours',
  'code',
  'design',
  'intro',
  'money',
] as const satisfies readonly Enums<'work_event_type'>[];

export type WorkEventType = (typeof WORK_EVENT_TYPES)[number];

/** Units per unit-of-quantity, per contribution type. */
export type WeightScheme = Record<WorkEventType, number>;

/**
 * The scheme seeded on promotion (7d: "saac = 8 halbeeg, PR la ansixiyay = 12,
 * naqshad la ansixiyay = 10, xiriir keenay ganacsi = 25"). It is a DEFAULT, not
 * a rule: from the moment a venture exists its members can vote a different one
 * (venture_weight_schemes + a lab_decisions row), and every past event keeps the
 * weight it was recorded with — re-weighting re-reads history, never edits it.
 *
 * `money` is 0 by design: the type is recorded-never-executed until escrow
 * exists, and a non-zero weight would hand it economic force it does not have.
 */
export const DEFAULT_WEIGHTS: WeightScheme = {
  hours: 8,
  code: 12,
  design: 10,
  intro: 25,
  money: 0,
};

/** Sanity bound on a voted weight (a scheme is member-set, not unbounded). */
export const WEIGHT_MAX = 1000;

// --- the board (7c) ----------------------------------------------------------

/**
 * The four columns, in board order. Ids match their `maal.board*` message keys
 * so a column can never render under another column's label.
 */
export const BOARD_COLUMNS = ['planned', 'inProgress', 'attestation', 'done'] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/**
 * Column → the task statuses it holds. "Marag & ansixin" is one column over two
 * statuses: a task that has been witnessed but not yet approved has not left
 * the attestation stage.
 */
export const BOARD_COLUMN_STATUSES: Record<BoardColumn, readonly Enums<'venture_task_status'>[]> = {
  planned: ['open'],
  inProgress: ['claimed'],
  attestation: ['submitted', 'attested'],
  done: ['verified'],
};

/** The inverse map — the column a status lands in. */
export const TASK_STATUS_COLUMN: Record<Enums<'venture_task_status'>, BoardColumn> = {
  open: 'planned',
  claimed: 'inProgress',
  submitted: 'attestation',
  attested: 'attestation',
  verified: 'done',
};

/**
 * Legal moves. Forward only, one step at a time, with one exception: a claimed
 * task can be released back to the board (nobody is trapped by having picked
 * something up). Nothing ever moves backwards out of the attestation stage —
 * un-witnessing is not a thing, and a correction to a VERIFIED task is a ledger
 * reversal, not a status edit.
 */
export const TASK_TRANSITIONS: Record<
  Enums<'venture_task_status'>,
  readonly Enums<'venture_task_status'>[]
> = {
  open: ['claimed'],
  claimed: ['submitted', 'open'],
  submitted: ['attested'],
  attested: ['verified'],
  verified: [],
};

/** The two transitions a member may never perform on their own task (recusal). */
export const RECUSED_TRANSITIONS = [
  'attested',
  'verified',
] as const satisfies readonly Enums<'venture_task_status'>[];

// --- limits (DB CHECKs, restated so the API answers in §27 copy) -------------

export const WORKSTREAM_NAME_MAX = 80;
export const TASK_TITLE_MAX = 200;
export const WORK_NOTE_MAX = 400;
/** Mirrors the DB check on recorded needs. Declaring a new one is paused (12 Sep). */
export const CAPITAL_PURPOSE_MAX = 400;

/** Goal statement + its unit ("40 / ganacsi firfircoon" on 7b). */
export const GOAL_STATEMENT_MAX = 280;
export const GOAL_UNIT_MAX = 40;

/**
 * One contribution event's quantity. Hours, PRs, designs and introductions are
 * counts; `money` is in CENTS (the tally sums it as money_cents), so the cap is
 * generous enough for a recorded — never moved — five-figure sum.
 */
export const WORK_QUANTITY_MIN = 0.01;
export const WORK_QUANTITY_MAX = 1_000_000;

/** App-side cap on workstreams per venture (anti-spam; no DB CHECK). */
export const WORKSTREAMS_PER_VENTURE_MAX = 20;

// --- page sizes + windows ----------------------------------------------------

export const VENTURE_INDEX_PAGE_SIZE = 20;
/** Tasks fetched per board column (7c shows counts, not infinite columns). */
export const BOARD_COLUMN_LIMIT = 50;
/** Event-trail page on 7d/7g ("Dhammaan · {n}" links to the full list). */
export const LEDGER_TRAIL_LIMIT = 100;
/** Default trail window — the 7g filter chip's "90 maalmood". */
export const LEDGER_DEFAULT_DAYS = 90;
export const LEDGER_MAX_DAYS = 3650;
/** Recent decisions on the 7b overview ("Go'aannada ugu dambeeyay"). */
export const OVERVIEW_DECISIONS_LIMIT = 5;

// --- rate limits -------------------------------------------------------------

/** Contribution logs per member per day (same tier as LAB_WRITE_LIMIT). */
export const CONTRIBUTION_LOG_LIMIT = 60;
export const RATE_WINDOW_DAY_SECONDS = 86_400;
