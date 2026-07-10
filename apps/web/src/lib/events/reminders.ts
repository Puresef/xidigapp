import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { insertNotification } from '@/lib/notifications/notify';

/**
 * T-24h event reminders (extras item 8, locked design) on the existing
 * notification/cron rails — /api/cron/events runs hourly.
 *
 * Idempotency: the sweep CLAIMS events entering the 24-hour window by setting
 * events.reminded_at in the same statement that selects them, so each event
 * reminds its RSVPed members exactly once no matter how often (or how
 * concurrently) the cron re-runs — the digest ledger stance in miniature.
 *
 * Both RSVP states are reminded ('interested' is a deliberate bookmark, and
 * absence already means no). In-app only for now — email joins extras item 14.
 * Cancelled / moderation-hidden events never remind (the claim filters them).
 */

export interface ReminderSweepResult {
  eventsClaimed: number;
  remindersSent: number;
}

export async function sendEventReminders(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<ReminderSweepResult> {
  const nowIso = now.toISOString();
  const windowEndIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Atomic claim: only unclaimed, published, moderation-clean events that
  // start within the next 24 hours (already-started events are skipped —
  // a reminder after the start would be noise).
  const { data: claimed, error } = await admin
    .from('events')
    .update({ reminded_at: nowIso })
    .is('reminded_at', null)
    .eq('status', 'published')
    .eq('moderation_status', 'published')
    .gt('starts_at', nowIso)
    .lte('starts_at', windowEndIso)
    .select('id, slug, host_user_id');
  if (error) throw new Error(`event reminder claim failed: ${error.message}`);

  let remindersSent = 0;
  for (const event of claimed ?? []) {
    const { data: rsvps, error: rsvpError } = await admin
      .from('event_rsvps')
      .select('user_id')
      .eq('event_id', event.id);
    if (rsvpError) {
      console.error('[events] reminder rsvp lookup failed:', rsvpError.message);
      continue;
    }
    for (const rsvp of rsvps ?? []) {
      if (rsvp.user_id === event.host_user_id) continue; // hosts know their own event
      await insertNotification(admin, {
        userId: rsvp.user_id,
        type: 'event_reminder',
        entityType: 'event',
        entityId: event.id,
        payload: { eventSlug: event.slug },
      });
      remindersSent += 1;
    }
  }

  return { eventsClaimed: (claimed ?? []).length, remindersSent };
}
