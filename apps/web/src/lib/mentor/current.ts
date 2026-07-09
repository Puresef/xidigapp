import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

/**
 * Mentor-in-Residence current-slot read (§20).
 *
 * The CURRENT mentor is the single residency whose [starts_on, ends_on] window
 * contains today. mentor_residencies is SELECT-able by any authenticated member
 * (RLS policy mentor_residencies_select_all), so an RLS-scoped client or the
 * service-role admin both work; pass whichever the caller already holds.
 *
 * The §20 "5 Asks/week" commitment is surfaced as `asksThisWeek` via the
 * mentor_asks_answered RPC (credited Ask answers over the last 7 days) — DISPLAY
 * ONLY, never a gate. Returns null when no residency covers today, so callers
 * can render nothing.
 */

export interface CurrentMentor {
  residencyId: string;
  period: string;
  focus: string | null;
  startsOn: string;
  endsOn: string;
  advisor: {
    userId: string;
    displayName: string;
    handle: string;
    avatarPath: string | null;
    avatarBlurhash: string | null;
  };
  asksThisWeek: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getCurrentMentor(
  client: SupabaseClient<Database>,
): Promise<CurrentMentor | null> {
  // `today` as a bare date so the comparison matches the DATE columns.
  const today = new Date().toISOString().slice(0, 10);

  const { data: residency } = await client
    .from('mentor_residencies')
    .select('id, advisor_user_id, period, focus, starts_on, ends_on')
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!residency) return null;

  const { data: profile } = await client
    .from('profiles')
    .select('display_name, handle, avatar_path, avatar_blurhash')
    .eq('user_id', residency.advisor_user_id)
    .maybeSingle();

  if (!profile) return null;

  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const { data: asks } = await client.rpc('mentor_asks_answered', {
    p_user_id: residency.advisor_user_id,
    p_since: since,
  });

  return {
    residencyId: residency.id,
    period: residency.period,
    focus: residency.focus,
    startsOn: residency.starts_on,
    endsOn: residency.ends_on,
    advisor: {
      userId: residency.advisor_user_id,
      displayName: profile.display_name,
      handle: profile.handle,
      avatarPath: profile.avatar_path,
      avatarBlurhash: profile.avatar_blurhash,
    },
    asksThisWeek: asks ?? 0,
  };
}
