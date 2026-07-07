/**
 * Labs / Spaces limits + windows (§16, §20). Mirrors the DB CHECK constraints
 * in 20260704000000_schema.sql (slug format, sprint 1–52 weeks, pins 1–3) so
 * validation fails fast in the API with §27 copy instead of a raw PG error.
 */

// Space identity
export const LAB_NAME_MAX = 80;
export const LAB_SLUG_MAX = 61; // DB: ^[a-z0-9]([a-z0-9-]{0,59}[a-z0-9])?$
export const LAB_SUMMARY_MAX = 280; // short_description

// Charter (the Club -> Lab quality gate)
export const CHARTER_PROBLEM_MAX = 600;
export const CHARTER_HYPOTHESIS_MAX = 600;
export const CHARTER_SUCCESS_MAX = 600;
export const SPRINT_LENGTH_MIN = 1;
export const SPRINT_LENGTH_MAX = 52; // weeks (DB CHECK)

/** The three charter fields that must be present before a Club can become a Lab. */
export const CHARTER_REQUIRED_FIELDS = [
  'problem_statement',
  'hypothesis',
  'success_definition',
] as const;

// Updates / artifacts / decisions
export const UPDATE_TITLE_MAX = 120;
export const UPDATE_BODY_MAX = 4000;
export const ARTIFACT_TITLE_MAX = 120;
export const ARTIFACT_URL_MAX = 2048;
export const ARTIFACT_DESCRIPTION_MAX = 400;
export const DECISION_TITLE_MAX = 120;
export const DECISION_CONTEXT_MAX = 2000;
export const DECISION_TEXT_MAX = 2000;

// Skills ("looking for")
export const SKILL_MAX = 40;
export const SKILLS_PER_LAB_MAX = 10;

// Candidate handoff (promotion target — marker only, no Capital)
export const CANDIDATE_NAME_MAX = 80;
export const CANDIDATE_ONE_LINER_MAX = 140;

// Pinned Labs on a profile (§20)
export const PINNED_LABS_MAX = 3; // DB CHECK position between 1 and 3

// Time-based sweeps (enforced in SQL; duplicated here for UI copy + tests)
export const DORMANCY_DAYS = 28; // §16/§26 (copy says "4 weeks" — same threshold)
export const SKILL_GAP_DAYS = 7; // §16

// Rate limits
export const LAB_CREATE_LIMIT = 5; // spaces created per day
export const LAB_WRITE_LIMIT = 60; // updates/artifacts/decisions per day
export const RATE_WINDOW_DAY_SECONDS = 86_400;

// §16 Lab playbooks — charter templates per venture type.
export const PLAYBOOK_VENTURE_TYPES = [
  'e-commerce',
  'import-export',
  'services',
  'saas',
  'agri-food',
] as const;

// Page sizes
export const LAB_LIST_PAGE_SIZE = 20;
