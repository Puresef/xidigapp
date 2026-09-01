import type { Database } from '@xidig/db';

import type { AuthContext } from '@/lib/auth/guards';

/**
 * Membership-capability checks — THE single boundary for tier-gated features.
 *
 * Tiers are a lookup table and their rights are tier_capabilities rows
 * (schema §membership: "a new tier is one INSERT (+ capability rows), zero
 * migration ... RLS gates via a join, never a hard-coded tier name"). Never
 * branch on a tier slug ('free', 'supporter') in app code: under a slug
 * literal any future third tier silently inherits — or silently loses —
 * every gate riding it. The has_capability() SECURITY DEFINER rpc evaluates
 * the join for auth.uid(), so this runs on the caller's RLS client.
 *
 * Gates in use: 'create_lab' (Lab create + Club→Lab promote), 'vote_candidate'
 * (governance vote), 'elevated_limits' (§26 Supporter daily post/comment
 * quotas), 'supporter_spaces' (DB-side only — can_read_lab), plus the §26
 * path capabilities checked by the Capital routes.
 */

export type MembershipCapability = Database['public']['Enums']['membership_capability'];

/** True when the caller's tier holds the capability (RLS-scoped rpc). */
export async function hasCapability(
  ctx: AuthContext,
  cap: MembershipCapability,
): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('has_capability', { cap });
  if (error) throw new Error(`capability check failed: ${error.message}`);
  return data === true;
}
