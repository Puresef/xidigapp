import type { Enums } from './database.types';

type MembershipCapability = Enums<'membership_capability'>;

/**
 * Every membership capability is exactly one of two kinds — classified by what
 * the capability actually DOES, not by its historical name.
 *
 * ORDINARY entitlements are paid resource/convenience allowances. They follow
 * ordinary membership, so they continue through the §19 deletion grace
 * ('pending_deletion') while the tier still grants them (owner ruling, 11 Sep:
 * grace is ordinary membership until final deletion). Checked by
 * has_entitlement() / hasEntitlement(), which admit active + pending_deletion.
 *
 * ACTIVE-ONLY capabilities are governance, capital or consequential powers, or
 * gates onto them. They need a fully active account. Checked by
 * has_capability() / hasCapability(), which admit active only.
 *
 * A Supporter never buys trust, ranking, verification, a governance vote,
 * capital eligibility or professional credibility through the ORDINARY list.
 *
 * Contract-tested against the database (grace-entitlements.test.ts): a new
 * enum value fails the suite until it is placed in one list, and
 * has_entitlement() answers false for anything not ORDINARY.
 */
export const ORDINARY_ENTITLEMENTS = [
  'elevated_limits', // higher daily post/comment quotas (§26)
  'supporter_spaces', // reading Spaces a lead marked Supporter-only
  'join_unlimited_labs', // join allowance — granted but enforced nowhere yet
  'intelligence_updates', // monthly directory-insight email — granted but built nowhere yet
] as const satisfies readonly MembershipCapability[];

export const ACTIVE_ONLY_CAPABILITIES = [
  'vote_candidate', // candidate governance vote
  'governance_rights', // governance — granted but enforced nowhere yet
  'builder_path', // create a Candidate (capital ladder)
  'investor_path', // capital — granted but enforced nowhere yet
  // Lab (Warshad) create/promote. Mixed: Lab mode carries project tooling but
  // is also the only rung from which a Space hands off to a Candidate or
  // becomes a Venture. Held active-only pending an owner ruling.
  'create_lab',
] as const satisfies readonly MembershipCapability[];

export type OrdinaryEntitlement = (typeof ORDINARY_ENTITLEMENTS)[number];
export type ActiveOnlyCapability = (typeof ACTIVE_ONLY_CAPABILITIES)[number];

// Compile-time half of the contract: once the generated types carry a new
// enum value, this stops type-checking until the value is classified above.
type Unclassified = Exclude<MembershipCapability, OrdinaryEntitlement | ActiveOnlyCapability>;
export const CAPABILITY_CLASSIFICATION_COMPLETE: [Unclassified] extends [never] ? true : false =
  true;
