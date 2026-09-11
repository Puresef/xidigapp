import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * Garab on a resolved Codsi (P1). post_cosigns is own-rows-only under RLS
 * (§13-style aggregates without enumeration), so the count comes from the
 * service role. The count is shown to every viewer who can read the ask —
 * Show support unlocks nothing (Packet B; the retired rule hid it until the
 * viewer took part).
 */
export interface PostCosignView {
  count: number;
  mine: boolean;
}

export async function fetchPostCosigns(
  admin: SupabaseClient<Database>,
  postId: string,
  viewerId: string,
): Promise<PostCosignView> {
  const [countResult, mineResult] = await Promise.all([
    admin
      .from('post_cosigns')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', postId),
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
