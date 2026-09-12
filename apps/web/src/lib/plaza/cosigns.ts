import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';

/**
 * Garab on a resolved Codsi (P1). post_cosigns is own-rows-only under RLS
 * (§13-style aggregates without enumeration), so the count comes from the
 * service role. The count is shown to every viewer who can read the ask —
 * Support unlocks nothing (Packet B; the retired rule hid it until the
 * viewer took part).
 *
 * Test-account quarantine (users.is_test, migration 20260912050000): the
 * "N people support this" count is organic proof, so a quarantined
 * seeded/test account's support never counts. The exclusion runs inside the
 * head count (`not in` the test ids) — still an aggregate, nobody enumerated.
 * The viewer's own `mine` flag is unaffected.
 */
export interface PostCosignView {
  count: number;
  mine: boolean;
}

async function countOrganicCosigns(admin: SupabaseClient<Database>, postId: string) {
  const testIds = await loadTestAccountIds(admin);
  let query = admin
    .from('post_cosigns')
    .select('post_id', { count: 'exact', head: true })
    .eq('post_id', postId);
  if (testIds.length > 0) query = query.not('user_id', 'in', postgrestIdList(testIds));
  return query;
}

export async function fetchPostCosigns(
  admin: SupabaseClient<Database>,
  postId: string,
  viewerId: string,
): Promise<PostCosignView> {
  const [countResult, mineResult] = await Promise.all([
    countOrganicCosigns(admin, postId),
    admin
      .from('post_cosigns')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', viewerId)
      .maybeSingle(),
  ]);
  if (countResult.error) throw new Error(`cosign count failed: ${countResult.error.message}`);
  if (mineResult.error) throw new Error(`own cosign lookup failed: ${mineResult.error.message}`);
  return { count: countResult.count ?? 0, mine: mineResult.data !== null };
}
