import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';

/**
 * The candidate interest counts a client may see — "I can help" and Show
 * support (Garab, interest_type 'cosign'). Nothing else.
 *
 * This is the ONE projection both the interests API and the /c/[id] page use.
 *
 *   * No invest number. Legacy `invest` intents recorded while the old funnel
 *     was live are retained untouched (retention is the separate Q2 ruling),
 *     but investing is not offered (A2), so that tally is not part of any
 *     approved flow: it is not even read here — only the two approved types
 *     are counted.
 *   * No test accounts. The counts are organic proof, so a quarantined
 *     seeded/test account's help or support never counts (users.is_test,
 *     migration 20260912050000). candidate_interest_counts() still counts
 *     them in SQL, so the counts come from two service-role head counts on
 *     `interests` (own-row-only under RLS) with the test ids excluded inside
 *     the count — still aggregates, nobody enumerated.
 */
export interface InterestCounts {
  help: number;
  cosign: number;
}

/** The only interest types whose counts ever leave the server. */
const COUNTED_TYPES = ['help', 'cosign'] as const;

export async function fetchCandidateInterestCounts(
  admin: SupabaseClient<Database>,
  candidateId: string,
): Promise<InterestCounts> {
  const testIds = await loadTestAccountIds(admin);
  const countOf = async (type: (typeof COUNTED_TYPES)[number]): Promise<number> => {
    let query = admin
      .from('interests')
      .select('candidate_id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .eq('type', type);
    if (testIds.length > 0) query = query.not('user_id', 'in', postgrestIdList(testIds));
    const { count, error } = await query;
    if (error) throw new Error(`interest counts failed: ${error.message}`);
    return count ?? 0;
  };
  const [help, cosign] = await Promise.all(COUNTED_TYPES.map(countOf));
  return { help: help ?? 0, cosign: cosign ?? 0 };
}
