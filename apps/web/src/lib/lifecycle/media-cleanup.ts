import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { MEDIA_BUCKET } from '@/lib/plaza/constants';

/**
 * §19 identity-media cleanup: after an account's final transition, the
 * member's avatar and cover objects must stop being fetchable.
 *
 * Why this is a separate step from the anonymisation transaction: the
 * database scrub clears profiles.avatar_path / cover_path, but those columns
 * are only pointers. The objects live in the PUBLIC post-media bucket and
 * remain readable at their raw URLs until the Storage API removes them —
 * which is a different system that can fail on its own. So:
 *
 *   * it runs only AFTER the row reaches 'deleted' (never during the grace
 *     period — a cancelled deletion must give the member their avatar back,
 *     and nothing here is reversible);
 *   * "no error from remove()" is not evidence — and that is not theoretical.
 *     Observed on Dev: remove() returned {data: [], error: null} for objects
 *     it had in fact deleted, so neither the error nor the returned list can
 *     settle the question. Every path is therefore re-checked against the
 *     bucket and a row is only marked purged when each of its objects is
 *     CONFIRMED absent. Already gone counts as success — that is what makes a
 *     retry safe. The check uses list(prefix, {search}) rather than exists():
 *     exists() answers 400 Bad Request on this Storage version even for an
 *     object that is present, which would have stalled every cleanup forever
 *     in the safe direction (never purged, retried each run);
 *   * one object failing must not lose the requirement for the others: each
 *     row is settled independently and an unsettled row keeps purged_at null,
 *     so the next sweep picks it up again. There is no attempt counter and no
 *     dead-letter state — the work is idempotent, so retrying forever is
 *     correct until an operator intervenes.
 *
 * Logging deliberately carries no raw public URL and no member identity: an
 * object path embeds the member's user id and is itself the thing we are
 * removing. Only the media row id and a coarse failure category are logged.
 */

type Admin = SupabaseClient<Database>;

/** Kinds whose objects ARE the member's identity. Post images are not. */
const IDENTITY_KINDS = ['avatar', 'cover'] as const;

export interface MediaPurgeResult {
  /** Rows whose every object is now confirmed absent. */
  purged: number;
  /** Rows still owing work (this run failed or could not confirm). */
  pending: number;
}

type PurgeFailure = 'remove_failed' | 'still_present' | 'mark_failed';

interface PendingRow {
  id: string;
  storage_path: string;
  thumb_path: string | null;
}

/**
 * Remove the identity objects owned by `userId` and mark each media row purged
 * once its objects are confirmed gone. Safe to call repeatedly; a row that is
 * already purged is not looked at again.
 */
export async function purgeIdentityMedia(admin: Admin, userId: string): Promise<MediaPurgeResult> {
  const { data, error } = await admin
    .from('media_uploads')
    .select('id, storage_path, thumb_path')
    .eq('owner_user_id', userId)
    .in('kind', [...IDENTITY_KINDS])
    .is('purged_at', null);
  if (error) throw new Error(`identity media scan failed: ${error.message}`);

  const rows = (data ?? []) as PendingRow[];
  let purged = 0;
  let pending = 0;

  for (const row of rows) {
    // The thumb is a derived object with its own key — it must go with the
    // source, or the member's face survives at the thumbnail URL.
    const paths = [row.storage_path, row.thumb_path].filter(
      (path): path is string => typeof path === 'string' && path.length > 0,
    );

    const failure = await purgeRow(admin, row.id, paths);
    if (failure) {
      pending += 1;
      console.error(`[lifecycle] identity media purge incomplete for media ${row.id}: ${failure}`);
      continue;
    }
    purged += 1;
  }

  return { purged, pending };
}

async function purgeRow(
  admin: Admin,
  rowId: string,
  paths: string[],
): Promise<PurgeFailure | null> {
  const bucket = admin.storage.from(MEDIA_BUCKET);

  // One call for the row's objects. An error here is not fatal on its own:
  // the object may already be gone, which the confirmation below settles.
  const { error: removeError } = await bucket.remove(paths);

  // Confirmation is what counts, not the remove() response.
  for (const path of paths) {
    const present = await objectExists(bucket, path);
    if (present === null) return removeError ? 'remove_failed' : 'still_present';
    if (present) return 'still_present';
  }

  const { error: markError } = await admin
    .from('media_uploads')
    .update({ purged_at: new Date().toISOString() })
    .eq('id', rowId);
  // The objects are gone; only the bookkeeping failed. Leaving purged_at null
  // means the next run re-confirms absence (cheap) and marks it then.
  if (markError) return 'mark_failed';

  return null;
}

type BucketApi = ReturnType<Admin['storage']['from']>;

/**
 * Is `path` still in the bucket? true / false / null when it cannot be told.
 *
 * Uses a targeted list() of the object's own folder rather than exists():
 * exists() returns 400 on this Storage version even for objects that are
 * there, and a confirmation primitive that cannot say "absent" would keep
 * every cleanup permanently pending. list(prefix, {search}) is the documented
 * call and answers exactly one row for a present object, zero for a missing
 * one — verified against Dev for both cases.
 */
async function objectExists(bucket: BucketApi, path: string): Promise<boolean | null> {
  const slash = path.lastIndexOf('/');
  const folder = slash === -1 ? '' : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);

  const { data, error } = await bucket.list(folder, { limit: 1, search: name });
  if (error) return null;
  return (data ?? []).some((entry) => entry.name === name);
}

/**
 * Reconciliation scan: accounts that already reached 'deleted' but still own
 * identity media that has not been confirmed gone. This is what turns a failed
 * or interrupted cleanup into work the next sweep picks up, independently of
 * the pending_deletion scan (which will never return those rows again).
 */
export async function findAccountsOwingMediaPurge(admin: Admin, limit = 200): Promise<string[]> {
  const { data, error } = await admin
    .from('media_uploads')
    .select('owner_user_id, users!inner(status)')
    .in('kind', [...IDENTITY_KINDS])
    .is('purged_at', null)
    .eq('users.status', 'deleted')
    .limit(limit);
  if (error) throw new Error(`identity media reconciliation scan failed: ${error.message}`);

  return Array.from(new Set((data ?? []).map((row) => row.owner_user_id)));
}
