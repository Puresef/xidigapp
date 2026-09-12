import type { ActiveOnlyCapability, OrdinaryEntitlement } from '@xidig/db';

import type { AuthContext } from '@/lib/auth/guards';

/**
 * Membership-capability checks — THE single boundary for tier-gated features.
 *
 * Tiers are a lookup table and their rights are tier_capabilities rows
 * (schema §membership: "a new tier is one INSERT (+ capability rows), zero
 * migration ... RLS gates via a join, never a hard-coded tier name"). Never
 * branch on a tier slug ('free', 'supporter') in app code: under a slug
 * literal any future third tier silently inherits — or silently loses —
 * every gate riding it. Both rpcs are SECURITY DEFINER and evaluate the join
 * for auth.uid(), so they run on the caller's RLS client.
 *
 * Two checks, split by what a capability DOES (@xidig/db entitlements.ts;
 * migration 20260911000600):
 *   hasEntitlement — ordinary paid resource/convenience allowances
 *     ('elevated_limits' daily post/comment quotas, 'supporter_spaces' —
 *     DB-side via can_read_lab — and the not-yet-enforced
 *     'join_unlimited_labs' / 'intelligence_updates'). Continues through the
 *     §19 deletion grace: the grace is ordinary membership.
 *   hasCapability — governance, capital and consequential powers
 *     ('vote_candidate', 'builder_path', 'create_lab', …). Active accounts
 *     only.
 * The parameter types make crossing the line a compile error.
 *
 * Xidig Plus doctrine (owner, 12 Sep): Xidig Plus is patronage, resources and
 * convenience ONLY. It never decides governance, candidate votes, candidate
 * submission, Lab/project creation, capital paths, verification, ranking,
 * trust or professional credibility. No app path calls hasCapability today:
 * the gates it used to key (Lab creation and promotion, candidate creation
 * and submission, the candidate vote) are PAUSED for everyone, and the five
 * active-only rows are removed from the paid tier (migration 20260912100100).
 * It stays as the active-only boundary for a future NON-paid rule.
 */

export type { ActiveOnlyCapability, OrdinaryEntitlement };

/** True when the caller's tier grants an ordinary entitlement (active or grace). */
export async function hasEntitlement(ctx: AuthContext, cap: OrdinaryEntitlement): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('has_entitlement', { cap });
  if (error) throw new Error(`entitlement check failed: ${error.message}`);
  return data === true;
}

/** True when the caller's tier grants an active-only capability and the account is active. */
export async function hasCapability(ctx: AuthContext, cap: ActiveOnlyCapability): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('has_capability', { cap });
  if (error) throw new Error(`capability check failed: ${error.message}`);
  return data === true;
}
