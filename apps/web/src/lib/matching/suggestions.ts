import type { LabMatch } from './looking-for';

/**
 * Interest-based follow suggestions (extras plan item 4) — the pure core.
 *
 * Declared-fields ONLY: lanes, skills, city, country, open-to chips, and Labs
 * seeking the member's skills (via the Phase-7 looking-for matcher). No
 * behavioral signals, no follower counts, no popularity — the score is exactly
 * the sum of the visible reason weights, so what ranks a suggestion is what
 * the card says about it. Deterministic: the same declared data always
 * produces the same list (stable weights, stable tiebreak on id).
 *
 * Privacy is enforced here, not in the UI: AI accounts, non-active accounts,
 * directory opt-outs, and anyone the viewer follows/blocked/muted (or who
 * blocked the viewer) never survive `buildFollowSuggestions`. Location-based
 * reasons respect the candidate's location_granularity — a member who rounds
 * their location to region/hidden is never surfaced as "same city as you".
 */

// --- reasons -----------------------------------------------------------------

export type PersonReason =
  | { kind: 'shares_lane'; value: string }
  | { kind: 'shares_skill'; value: string }
  | { kind: 'same_city' }
  | { kind: 'same_country' }
  | { kind: 'shares_open_to'; value: string }
  /** They declared `hiring`, the viewer declared `hire_me`. */
  | { kind: 'they_hiring' }
  /** The viewer declared `hiring`, they declared `hire_me`. */
  | { kind: 'you_hiring' };

export type PersonReasonKind = PersonReason['kind'];

/**
 * Transparent, fixed reason weights. Score = Σ weights of the reasons shown —
 * no hidden terms. Same-city is strongest (the offline-meetup case), the
 * hiring↔open-to-work complement next, then lanes, skills/open-to overlap,
 * and same-country as the weakest signal.
 */
export const REASON_WEIGHTS: Record<PersonReasonKind, number> = {
  same_city: 4,
  they_hiring: 3,
  you_hiring: 3,
  shares_lane: 3,
  shares_skill: 2,
  shares_open_to: 2,
  same_country: 1,
};

/** Total combined cap (people + Labs) and the Lab share of it. */
export const SUGGESTION_MAX = 10;
export const LAB_SUGGESTION_MAX = 3;

// --- inputs ------------------------------------------------------------------

export interface DeclaredFields {
  lanes: readonly string[];
  skills: readonly string[];
  city: string | null;
  country: string | null;
  /** open_to_kinds slugs (profile_open_to). */
  openTo: readonly string[];
}

export interface PersonCandidate extends DeclaredFields {
  userId: string;
  /** users.is_ai — AI accounts are never suggested (§21 organic-proof). */
  isAi: boolean;
  /** users.status — only 'active' accounts are suggested. */
  accountStatus: string;
  /** user_settings.discoverable_directory (absent row = true). */
  discoverable: boolean;
  /** user_settings.location_granularity (absent row = 'city'). */
  locationGranularity: string;
}

export interface SuggestionExclusions {
  viewerId: string;
  /** Users the viewer already follows. */
  followedUserIds: ReadonlySet<string>;
  /** Blocks in EITHER direction (viewer blocked them, or they blocked viewer). */
  blockedUserIds: ReadonlySet<string>;
  /** Users the viewer muted. */
  mutedUserIds: ReadonlySet<string>;
}

export interface PersonSuggestion<T extends PersonCandidate = PersonCandidate> {
  candidate: T;
  /** Ordered strongest-first; always non-empty (no reason ⇒ no suggestion). */
  reasons: PersonReason[];
  /** Exactly the sum of the reasons' weights. */
  score: number;
}

export interface FollowSuggestions<T extends PersonCandidate = PersonCandidate> {
  people: PersonSuggestion<T>[];
  labs: LabMatch[];
}

// --- helpers -------------------------------------------------------------------

const fold = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

/** City is showable at 'exact'/'city' granularity; country at anything but 'hidden'. */
const cityVisible = (g: string): boolean => g === 'exact' || g === 'city';
const countryVisible = (g: string): boolean => g !== 'hidden';

/**
 * Compute the visible reasons a candidate matches the viewer's declared
 * fields. Order is fixed (city → hiring complement → lanes → skills → open-to
 * → country); array values follow the VIEWER's declared order, so output is
 * deterministic given the same declared data.
 */
export function personReasons(me: DeclaredFields, candidate: PersonCandidate): PersonReason[] {
  const reasons: PersonReason[] = [];

  const theirLanes = new Set(candidate.lanes);
  const theirSkills = new Set(candidate.skills);
  const theirOpenTo = new Set(candidate.openTo);

  const sameCity =
    Boolean(fold(me.city)) &&
    fold(candidate.city) === fold(me.city) &&
    cityVisible(candidate.locationGranularity);
  if (sameCity) reasons.push({ kind: 'same_city' });

  if (theirOpenTo.has('hiring') && me.openTo.includes('hire_me')) {
    reasons.push({ kind: 'they_hiring' });
  }
  if (theirOpenTo.has('hire_me') && me.openTo.includes('hiring')) {
    reasons.push({ kind: 'you_hiring' });
  }

  for (const lane of me.lanes) {
    if (theirLanes.has(lane)) reasons.push({ kind: 'shares_lane', value: lane });
  }
  for (const skill of me.skills) {
    if (theirSkills.has(skill)) reasons.push({ kind: 'shares_skill', value: skill });
  }
  for (const openTo of me.openTo) {
    if (theirOpenTo.has(openTo)) reasons.push({ kind: 'shares_open_to', value: openTo });
  }

  // Same-country only when city didn't already match (no double counting).
  if (
    !sameCity &&
    Boolean(fold(me.country)) &&
    fold(candidate.country) === fold(me.country) &&
    countryVisible(candidate.locationGranularity)
  ) {
    reasons.push({ kind: 'same_country' });
  }

  return reasons;
}

// --- people -------------------------------------------------------------------

/**
 * Score + rank people. Applies every privacy exclusion, drops zero-reason
 * candidates (a suggestion with nothing to say for itself is filler, and
 * filler is banned), sorts by score desc with a stable userId tiebreak.
 */
export function buildPersonSuggestions<T extends PersonCandidate>(
  me: DeclaredFields,
  candidates: readonly T[],
  exclusions: SuggestionExclusions,
  limit: number = SUGGESTION_MAX,
): PersonSuggestion<T>[] {
  const seen = new Set<string>();
  const suggestions: PersonSuggestion<T>[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.userId)) continue;
    seen.add(candidate.userId);

    if (candidate.userId === exclusions.viewerId) continue;
    if (candidate.isAi) continue;
    if (candidate.accountStatus !== 'active') continue;
    if (!candidate.discoverable) continue;
    if (exclusions.followedUserIds.has(candidate.userId)) continue;
    if (exclusions.blockedUserIds.has(candidate.userId)) continue;
    if (exclusions.mutedUserIds.has(candidate.userId)) continue;

    const reasons = personReasons(me, candidate);
    if (reasons.length === 0) continue;

    const score = reasons.reduce((sum, reason) => sum + REASON_WEIGHTS[reason.kind], 0);
    suggestions.push({ candidate, reasons, score });
  }

  suggestions.sort(
    (a, b) => b.score - a.score || a.candidate.userId.localeCompare(b.candidate.userId),
  );
  return suggestions.slice(0, Math.max(0, limit));
}

// --- labs ---------------------------------------------------------------------

/**
 * Filter + deterministically re-rank the looking-for matches: drop muted Labs,
 * sort score desc with a labId tiebreak (the upstream matcher's sort has no
 * tiebreak of its own), cap at the Lab share of the budget.
 */
export function buildLabSuggestions(
  labMatches: readonly LabMatch[],
  mutedLabIds: ReadonlySet<string>,
  limit: number = LAB_SUGGESTION_MAX,
): LabMatch[] {
  return labMatches
    .filter((match) => !mutedLabIds.has(match.labId))
    .sort((a, b) => b.score - a.score || a.labId.localeCompare(b.labId))
    .slice(0, Math.max(0, limit));
}

// --- combined -----------------------------------------------------------------

/**
 * The 3–10 people/Lab budget: Labs take at most LAB_SUGGESTION_MAX slots,
 * people fill the rest up to SUGGESTION_MAX total. Either list may be empty —
 * the UI owns the sparse-data empty state (never padded with filler here).
 */
export function buildFollowSuggestions<T extends PersonCandidate>(
  me: DeclaredFields,
  candidates: readonly T[],
  exclusions: SuggestionExclusions,
  labMatches: readonly LabMatch[] = [],
  mutedLabIds: ReadonlySet<string> = new Set<string>(),
): FollowSuggestions<T> {
  const labs = buildLabSuggestions(labMatches, mutedLabIds);
  const people = buildPersonSuggestions(me, candidates, exclusions, SUGGESTION_MAX - labs.length);
  return { people, labs };
}
