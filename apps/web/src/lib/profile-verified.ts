import type { Database } from '@xidig/db';

type ProfileVerificationStatus = Database['public']['Enums']['profile_verification_status'];

/**
 * THE verified-profile predicate (§14 ladder): community_verified and
 * identity_verified are the two genuine verified tiers — pending/unverified
 * are not. Every surface that asks "is this member verified?" (feed bylines,
 * DM headers, search rows, the directory's verified-only filter, the vouch
 * eligibility gate) answers through here, so a future tier added beside or
 * above identity_verified is ONE edit, not a hunt through scattered
 * hand-written disjunctions that silently disagree.
 *
 * Deliberately client-safe: no imports beyond DB types — this is consumed by
 * 'use client' components, server pages, services and API query filters alike.
 */
export const VERIFIED_PROFILE_STATUSES = [
  'community_verified',
  'identity_verified',
] as const satisfies readonly ProfileVerificationStatus[];

/** True when the status is one of the §14 verified tiers. */
export function isVerifiedProfile(status: string | null | undefined): boolean {
  return (VERIFIED_PROFILE_STATUSES as readonly string[]).includes(status ?? '');
}
