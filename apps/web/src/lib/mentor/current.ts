import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Mentor-in-Residence current-slot read (§20; Task 9 extends it with the
 * bookable-slots read).
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
 *
 * `labName` is resolved through the SERVICE ROLE regardless of which client
 * the caller passed for the rest of the read: `labs` RLS gates visibility on
 * `can_read_lab` (membership/listing), but the host name on a residency is
 * public metadata by construction (mentor_residencies has no such gate) — a
 * member outside the Lab must still see who is hosting.
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
  /** Warshad host name (Task 9), null when the residency has no lab_id. */
  labName: string | null;
  /** Free-text hours line ("Khamiis 18:00–20:00"), null when unset. */
  hoursNote: string | null;
  /** Per-slot length in minutes (mentor_residencies.slot_minutes, default 20). */
  slotMinutes: number;
}

/** One bookable slot as a member may see it — never the booker's identity. */
export interface MentorSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  /** `taken` = someone else's booking; `yours` = the viewer's own. */
  state: 'open' | 'taken' | 'yours';
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getCurrentMentor(
  client: SupabaseClient<Database>,
): Promise<CurrentMentor | null> {
  // `today` as a bare date so the comparison matches the DATE columns.
  const today = new Date().toISOString().slice(0, 10);

  const { data: residency } = await client
    .from('mentor_residencies')
    .select('id, advisor_user_id, period, focus, starts_on, ends_on, lab_id, hours_note, slot_minutes')
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!residency) return null;

  let labName: string | null = null;
  if (residency.lab_id) {
    const admin = getSupabaseAdmin();
    const { data: lab } = await admin
      .from('labs')
      .select('name')
      .eq('id', residency.lab_id)
      .maybeSingle();
    labName = lab?.name ?? null;
  }

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
    labName,
    hoursNote: residency.hours_note,
    slotMinutes: residency.slot_minutes,
  };
}

/**
 * Bookable slots for a residency, from the viewer's point of view.
 *
 * `client` reads the member-grant-visible columns (id, starts_at, ends_at,
 * booked_at) — `booked_by_user_id` is excluded from that grant entirely
 * (migration 20260812000000), so open/taken is all this half can ever learn.
 * A second, SERVICE-ROLE-only lookup then asks the one question the grant
 * can't answer — "is any of these mine?" — and that single id is the only
 * identity information that ever leaves this function; the booker's actual
 * column value is never read into a response.
 */
export async function getMentorSlots(
  client: SupabaseClient<Database>,
  residencyId: string,
  viewerId: string | null,
): Promise<MentorSlot[]> {
  const { data: rows } = await client
    .from('mentor_slots')
    .select('id, starts_at, ends_at, booked_at')
    .eq('residency_id', residencyId)
    .order('starts_at', { ascending: true });
  if (!rows) return [];

  let yoursId: string | null = null;
  if (viewerId) {
    const admin = getSupabaseAdmin();
    const { data: own } = await admin
      .from('mentor_slots')
      .select('id')
      .eq('residency_id', residencyId)
      .eq('booked_by_user_id', viewerId)
      .maybeSingle();
    yoursId = own?.id ?? null;
  }

  return rows.map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    state: row.id === yoursId ? 'yours' : row.booked_at !== null ? 'taken' : 'open',
  }));
}
