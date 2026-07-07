/**
 * Capital / Maal limits + governance windows (§10/§12/§17). Field max lengths
 * mirror the venture_candidates content columns; NAME/ONE_LINER match the Phase 4
 * promotion marker (lib/labs/constants CANDIDATE_NAME_MAX/CANDIDATE_ONE_LINER_MAX)
 * so the draft a Lab promotes into and the Capital editor agree on limits.
 *
 * The governance-vote constants (quorum / approval / window) are the raw
 * parameters of tallyGovernanceVote() + voteWindow() — kept here so the API,
 * the tally lib and the UI all read the same numbers.
 */

// Candidate identity (match the Phase 4 promotion marker — do NOT diverge).
export const CANDIDATE_NAME_MAX = 80;
export const CANDIDATE_ONE_LINER_MAX = 140;

// Pitch content fields (venture_candidates.problem/solution/traction/team/ask).
export const CANDIDATE_PROBLEM_MAX = 2000;
export const CANDIDATE_SOLUTION_MAX = 2000;
export const CANDIDATE_TRACTION_MAX = 2000;
export const CANDIDATE_TEAM_MAX = 2000;
export const CANDIDATE_ASK_MAX = 2000;

// Reviewer notes + candidate status reason (decline/park reasons are visible, §17).
export const CANDIDATE_STATUS_REASON_MAX = 500;
export const REVIEW_NOTES_MAX = 2000;

// Interest / fund-intent free-text note.
export const INTEREST_MESSAGE_MAX = 500;

// Rubric per-criterion score bounds (candidate_reviews CHECK is 1..5 smallint).
export const RUBRIC_SCORE_MIN = 1;
export const RUBRIC_SCORE_MAX = 5;

// --- Supporter governance vote (§12/§17) ------------------------------------
// Quorum = QUORUM_MIN votes OR QUORUM_FRACTION of eligible Supporters; the
// signal passes when quorum is met AND approval ≥ APPROVAL_THRESHOLD. Window is
// VOTE_WINDOW_DAYS from vote_opens_at.
export const VOTE_WINDOW_DAYS = 7;
export const QUORUM_MIN = 5;
export const QUORUM_FRACTION = 0.2;
export const APPROVAL_THRESHOLD = 0.6;

/** Somalia ISO 3166-1 alpha-2 (lowercased). The only region Maalgeli is gated to. */
export const SOMALIA_ISO = 'so';

// Page size for the candidate list (keyset).
export const CANDIDATE_LIST_PAGE_SIZE = 20;
