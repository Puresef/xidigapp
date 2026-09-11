import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { writeAudit } from '@/lib/audit';
import { DELETION_GRACE_DAYS } from '@/lib/moderation/constants';

import { anonymiseUser } from './anonymise';

/**
 * §19 time-based lifecycle sweep, invoked by /api/cron/lifecycle. Two jobs:
 *
 *  (a) Grace-expiry: anonymise accounts left in 'pending_deletion' past the
 *      DELETION_GRACE_DAYS window. Each account is one transactional RPC
 *      (see anonymise.ts); the RPC itself refuses a row whose status moved
 *      (a cancel that landed after our select) and is idempotent on a row an
 *      overlapping invocation already finished — Vercel documents both
 *      duplicate and overlapping cron runs, so the sweep is reconciliation-
 *      based rather than lock-based. One failing account never blocks the rest.
 *  (b) §14 recording retention: null out expired verification recordings.
 *
 * All writes are service role. The recording purge only audits (no
 * verification_access_log row): access-log requires a NOT-NULL actor and a
 * retention purge is system-initiated, so the immutable audit trail is the
 * correct record of the wipe.
 *
 * Counts are honest: `mediaPending` is the number of avatar/cover uploads
 * whose storage objects still sit in the public bucket after anonymisation.
 * It is not zero until a storage mechanism is approved and built.
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
  /** Avatar/cover uploads still holding public storage objects. */
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
          counts.mediaPending += outcome.mediaPending;
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

  // (b) §14 recording retention → null the URL once expired.
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
