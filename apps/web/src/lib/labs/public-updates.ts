import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { keepRetainedAuthorRows } from '@/lib/retained-content';

/**
 * Updates on the signed-out public Space page. The page reads through the
 * service role (anon has no lab_updates policy), so it must apply the member
 * rule itself — otherwise it shows MORE than a signed-in member sees. Before
 * this, a suspended or deactivated author's updates were hidden from members
 * (RLS) yet shown to anonymous visitors: an audience inversion. The rule is
 * the one the lab_updates policy uses (author_is_retained, 20260911001100):
 * live or deleted authors stay (deleted = tombstone history, the 998f991
 * ruling); suspended and deactivated authors are hidden. The public page
 * shows no author name either way.
 *
 * Over-fetches so filtering still fills the page when some rows drop out.
 */
export interface PublicSpaceUpdate {
  id: string;
  title: string | null;
  body: string;
  created_at: string;
}

export async function listPublicSpaceUpdates(
  admin: SupabaseClient<Database>,
  labId: string,
  limit = 20,
): Promise<PublicSpaceUpdate[]> {
  const { data, error } = await admin
    .from('lab_updates')
    .select('id, title, body, created_at, author_user_id')
    .eq('lab_id', labId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit * 3);
  if (error) throw new Error(`public space updates failed: ${error.message}`);
  const kept = await keepRetainedAuthorRows(admin, data ?? []);
  // author_user_id is read only to apply the rule; it never reaches the page.
  return kept.slice(0, limit).map(({ id, title, body, created_at }) => ({
    id,
    title,
    body,
    created_at,
  }));
}
