import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * §19 anonymise-not-delete: the final lifecycle transition for an account
 * whose 30-day grace has expired.
 *
 * The whole transition is ONE database transaction — public.anonymise_user()
 * (migration 20260911000100), service-role only. It locks the users row,
 * refuses anything but pending_deletion (a cancel that committed first wins),
 * is idempotent on an already-deleted row, scrubs every identifying profile
 * column plus the presentation satellites and the avatar/cover alt text, flips
 * the users row, and writes the audit row — so a failure anywhere leaves NO
 * partial state and NO audit row claiming otherwise. Before this it was two
 * PostgREST statements and a best-effort scrub, and a profile failure was
 * silently permanent.
 *
 * Deliberately untouched, by design (separate retention obligations): posts,
 * comments, messages (incl. the counterparty's copy), listings, events, Space
 * membership, work evidence, audit/mod/governance records, vouches. Retained
 * content renders under the neutral "Deleted member" tombstone.
 *
 * NOT done here — both live in other systems and are separate, retryable
 * sweep steps (sweeps.ts): shutting down the GoTrue identity (auth-shutdown.ts;
 * auth.users is never touched by this transaction) and removing the
 * avatar/cover objects from the public bucket (media-cleanup.ts). A committed
 * transaction is therefore not a finished deletion.
 */

type Admin = SupabaseClient<Database>;

export type AnonymiseOutcome =
  | { outcome: 'anonymised'; mediaPending: number }
  | { outcome: 'already_deleted' }
  | { outcome: 'skipped'; status: string }
  | { outcome: 'not_found' };

export async function anonymiseUser(admin: Admin, userId: string): Promise<AnonymiseOutcome> {
  const { data, error } = await admin.rpc('anonymise_user', { p_user_id: userId });
  if (error) throw new Error(`user anonymise failed: ${error.message}`);

  const result = (data ?? {}) as { outcome?: string; media_pending?: number; status?: string };
  switch (result.outcome) {
    case 'anonymised':
      return { outcome: 'anonymised', mediaPending: result.media_pending ?? 0 };
    case 'already_deleted':
      return { outcome: 'already_deleted' };
    case 'skipped':
      return { outcome: 'skipped', status: result.status ?? 'unknown' };
    case 'not_found':
      return { outcome: 'not_found' };
    default:
      throw new Error(`user anonymise returned an unknown outcome: ${String(result.outcome)}`);
  }
}
