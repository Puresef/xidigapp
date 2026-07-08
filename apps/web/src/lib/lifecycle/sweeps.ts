import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { writeAudit } from '@/lib/audit';
import { DELETION_GRACE_DAYS } from '@/lib/moderation/constants';

import { anonymiseUser } from './anonymise';

/**
 * §19 time-based lifecycle sweep, invoked by /api/cron/lifecycle. Two jobs:
 *
 *  (a) Grace-expiry: anonymise accounts left in 'pending_deletion' past the
 *      DELETION_GRACE_DAYS window (anonymise-not-delete — see anonymise.ts).
 *  (b) §14 recording retention: null out expired verification recordings.
 *
 * All writes are service role. The recording purge only audits (no
 * verification_access_log row): access-log requires a NOT-NULL actor and a
 * retention purge is system-initiated, so the immutable audit trail is the
 * correct record of the wipe.
 */

type Admin = SupabaseClient<Database>;

export async function runLifecycleSweep(
  admin: Admin,
): Promise<{ anonymised: number; recordingsPurged: number }> {
  let anonymised = 0;
  let recordingsPurged = 0;

  // (a) Grace-expiry → anonymise. Cutoff computed in JS (Date.now() is fine in
  // app code); anything requested before it has outlived the grace window.
  const deletionCutoff = new Date(
    Date.now() - DELETION_GRACE_DAYS * 86_400_000,
  ).toISOString();
  const { data: expired, error: expiredError } = await admin
    .from('users')
    .select('id')
    .eq('status', 'pending_deletion')
    .lt('deletion_requested_at', deletionCutoff);
  if (expiredError) throw new Error(`lifecycle deletion scan failed: ${expiredError.message}`);

  for (const row of expired ?? []) {
    try {
      await anonymiseUser(admin, row.id);
      anonymised += 1;
    } catch (error) {
      // One bad account must not stall the rest of the sweep.
      console.error(
        `[lifecycle] anonymise failed for ${row.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // (b) §14 recording retention → null the URL once expired.
  const nowIso = new Date().toISOString();
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
    recordingsPurged += 1;
    await writeAudit(admin, {
      actorUserId: null,
      action: 'verification.recording_purged',
      targetType: 'verification',
      targetId: verification.id,
    });
  }

  return { anonymised, recordingsPurged };
}
