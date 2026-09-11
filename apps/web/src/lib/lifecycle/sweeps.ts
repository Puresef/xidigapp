import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { writeAudit } from '@/lib/audit';
import { DELETION_GRACE_DAYS } from '@/lib/moderation/constants';

import { anonymiseUser } from './anonymise';
import {
  findAccountsOwingAuthCleanup,
  recordAuthCleanup,
  shutDownAuthIdentity,
} from './auth-shutdown';
import { findAccountsOwingMediaPurge, purgeIdentityMedia } from './media-cleanup';

/**
 * §19 time-based lifecycle sweep, invoked by /api/cron/lifecycle. Jobs:
 *
 *  (a) Grace-expiry: anonymise accounts left in 'pending_deletion' past the
 *      DELETION_GRACE_DAYS window. Each account is one transactional RPC
 *      (see anonymise.ts); the RPC itself refuses a row whose status moved
 *      (a cancel that landed after our select) and is idempotent on a row an
 *      overlapping invocation already finished — Vercel documents both
 *      duplicate and overlapping cron runs, so the sweep is reconciliation-
 *      based rather than lock-based. One failing account never blocks the rest.
 *  (b) Auth shutdown (Option A, see auth-shutdown.ts): ban the GoTrue identity
 *      of every 'deleted' account and replace its email with a non-routable
 *      pseudonym. Also a SECOND system, also reconciliation-based: the scan is
 *      "deleted and auth_cleaned_at is null", so an account whose earlier
 *      attempt failed is simply found again, and a completed one is never
 *      touched twice. Until it succeeds the account can still sign in and
 *      refresh at GoTrue directly, so authPending > 0 means deletion is NOT
 *      finished for those accounts.
 *  (c) Identity-media cleanup: the avatar/cover objects of an account that
 *      reached 'deleted'. This is a SECOND system (Storage) and can fail on
 *      its own, so it is reconciliation-based: the scan finds every deleted
 *      account whose identity media is not yet confirmed gone, including ones
 *      finalised by an earlier run whose cleanup failed. A database
 *      transition is never reported as a finished deletion while
 *      mediaPending > 0.
 *  (d) §14 recording retention: null out expired verification recordings.
 *
 * All writes are service role. The recording purge only audits (no
 * verification_access_log row): access-log requires a NOT-NULL actor and a
 * retention purge is system-initiated, so the immutable audit trail is the
 * correct record of the wipe.
 *
 * Counts are honest. `authCompleted` / `authPending` and `mediaPurged` /
 * `mediaPending` come from their reconciliation scans, not from the
 * transition — the RPC's own media_pending describes the moment it
 * committed, which is already stale by the time the objects are removed.
 * authPending > 0 means some deleted account can still obtain sessions;
 * mediaPending > 0 means some member's avatar or cover is still fetchable at
 * its public URL. Either way the deletion is not finished.
 */

type Admin = SupabaseClient<Database>;

export interface LifecycleSweepCounts {
  anonymised: number;
  /** Status moved before the RPC ran (a cancel won the race) — nothing done. */
  skipped: number;
  /** Already finished by an earlier or overlapping run — nothing done. */
  alreadyDeleted: number;
  /** RPC threw; logged by id only, retried on the next run (row stays pending). */
  failed: number;
  /** Deleted accounts whose GoTrue identity read back as banned + pseudonymised. */
  authCompleted: number;
  /**
   * Deleted accounts whose auth shutdown is still owed after this run (a
   * provider failure, a thrown attempt, an unwritten marker, or — counted as
   * one — a failed scan). Non-zero means those accounts can still obtain
   * sessions at GoTrue; the next run retries them.
   */
  authPending: number;
  /** Avatar/cover rows whose objects were confirmed gone this run. */
  mediaPurged: number;
  /**
   * Avatar/cover rows still holding public storage objects. Non-zero means
   * deletion is NOT complete for those accounts, however clean the database
   * looks — the next run retries them.
   */
  mediaPending: number;
  recordingsPurged: number;
}

export async function runLifecycleSweep(
  admin: Admin,
  now: Date = new Date(),
): Promise<LifecycleSweepCounts> {
  const counts: LifecycleSweepCounts = {
    anonymised: 0,
    skipped: 0,
    alreadyDeleted: 0,
    failed: 0,
    authCompleted: 0,
    authPending: 0,
    mediaPurged: 0,
    mediaPending: 0,
    recordingsPurged: 0,
  };

  // (a) Grace-expiry → anonymise.
  const deletionCutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000).toISOString();

  const { data: expired, error: expiredError } = await admin
    .from('users')
    .select('id')
    .eq('status', 'pending_deletion')
    .lt('deletion_requested_at', deletionCutoff);
  if (expiredError) throw new Error(`lifecycle deletion scan failed: ${expiredError.message}`);

  for (const row of expired ?? []) {
    try {
      const outcome = await anonymiseUser(admin, row.id);
      switch (outcome.outcome) {
        case 'anonymised':
          counts.anonymised += 1;
          break;
        case 'skipped':
          counts.skipped += 1;
          break;
        case 'already_deleted':
          counts.alreadyDeleted += 1;
          break;
        case 'not_found':
          counts.skipped += 1;
          break;
      }
    } catch (error) {
      // One bad account must not stall the rest of the sweep. The row is still
      // pending_deletion, so the next run picks it up again. Only the id and
      // the driver message are logged — never row contents.
      counts.failed += 1;
      console.error(
        `[lifecycle] anonymise failed for ${row.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // (b) Auth shutdown. Covers accounts finalised just now AND any earlier
  //     account whose shutdown did not complete. Logs carry the category only
  //     — the failing account is findable from its own row
  //     (auth_cleanup_failure), so no id, address or provider text is logged.
  let authOwing: string[] = [];
  try {
    authOwing = await findAccountsOwingAuthCleanup(admin);
  } catch {
    // Unknown how many are owed; count one so the run cannot read as complete.
    counts.authPending += 1;
    console.error('[lifecycle] auth shutdown scan failed');
  }
  for (const userId of authOwing) {
    try {
      const result = await shutDownAuthIdentity(admin, userId, now);
      const recorded = await recordAuthCleanup(admin, userId, result, now);
      if (result.outcome === 'completed' && recorded) {
        counts.authCompleted += 1;
        continue;
      }
      counts.authPending += 1;
      console.error(
        `[lifecycle] auth shutdown pending: ${
          result.outcome === 'failed' ? result.failure : 'completed_but_unrecorded'
        }`,
      );
    } catch {
      counts.authPending += 1;
      console.error('[lifecycle] auth shutdown pending: unexpected_error');
    }
  }

  // (c) Identity media. Covers accounts finalised just now AND any earlier
  //     account whose cleanup did not complete — one scan, so a failure is
  //     simply work the next run finds again.
  let owing: string[] = [];
  try {
    owing = await findAccountsOwingMediaPurge(admin);
  } catch (error) {
    console.error(
      '[lifecycle] identity media scan failed:',
      error instanceof Error ? error.message : error,
    );
  }
  for (const ownerId of owing) {
    try {
      const result = await purgeIdentityMedia(admin, ownerId);
      counts.mediaPurged += result.purged;
      counts.mediaPending += result.pending;
    } catch (error) {
      // Unknown row count still owed; count it as at least one so the run
      // cannot read as "media complete".
      counts.mediaPending += 1;
      console.error(
        `[lifecycle] identity media purge failed for ${ownerId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // (d) §14 recording retention → null the URL once expired.
  const nowIso = now.toISOString();
  const { data: expiredRecordings, error: recordingError } = await admin
    .from('verifications')
    .select('id')
    .not('recording_url', 'is', null)
    .lt('recording_expires_at', nowIso);
  if (recordingError) {
    throw new Error(`lifecycle recording scan failed: ${recordingError.message}`);
  }

  for (const verification of expiredRecordings ?? []) {
    const { error: purgeError } = await admin
      .from('verifications')
      .update({ recording_url: null })
      .eq('id', verification.id);
    if (purgeError) {
      console.error(
        `[lifecycle] recording purge failed for ${verification.id}:`,
        purgeError.message,
      );
      continue;
    }
    counts.recordingsPurged += 1;
    await writeAudit(admin, {
      actorUserId: null,
      action: 'verification.recording_purged',
      targetType: 'verification',
      targetId: verification.id,
    });
  }

  return counts;
}
