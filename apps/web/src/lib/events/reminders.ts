import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { insertNotification } from '@/lib/notifications/notify';

/**
 * T-3d event reminders (extras item 8, window widened by Task 4) on the
 * existing notification/cron rails — /api/cron/events runs hourly.
 *
 * Idempotency: the sweep CLAIMS events entering the 72-hour window by setting
 * events.reminded_at in the same statement that selects them, so each event
 * reminds its RSVPed members exactly once no matter how often (or how
 * concurrently) the cron re-runs — the digest ledger stance in miniature.
 *
 * The payload is a send-time snapshot — enough to render the notification
 * without a second read: { eventSlug, title, startsAt, timezone, going,
 * capacity, status } where `status` is that member's OWN RSVP.
 *
 * Both RSVP states are reminded ('interested' is a deliberate bookmark, and
 * absence already means no). In-app only for now — email joins extras item 14.
 * Cancelled / moderation-hidden events never remind (the claim filters them).
 */

/** T-3d: events starting within the next 72 hours get their reminder. */
export const REMINDER_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface ReminderSweepResult {
  eventsClaimed: number;
  remindersSent: number;
}

export async function sendEventReminders(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<ReminderSweepResult> {
  const nowIso = now.toISOString();
  const windowEndIso = new Date(now.getTime() + REMINDER_WINDOW_MS).toISOString();

  // Atomic claim: only unclaimed, published, moderation-clean events that
  // start within the next 72 hours (already-started events are skipped —
  // a reminder after the start would be noise).
  const { data: claimed, error } = await admin
    .from('events')
    .update({ reminded_at: nowIso })
    .is('reminded_at', null)
    .eq('status', 'published')
    .eq('moderation_status', 'published')
    .gt('starts_at', nowIso)
    .lte('starts_at', windowEndIso)
    .select('id, slug, title, starts_at, timezone, capacity, host_user_id');
  if (error) throw new Error(`event reminder claim failed: ${error.message}`);

  let remindersSent = 0;
  for (const event of claimed ?? []) {
    const { data: rsvps, error: rsvpError } = await admin
      .from('event_rsvps')
      .select('user_id, status')
      .eq('event_id', event.id);
    if (rsvpError) {
      console.error('[events] reminder rsvp lookup failed:', rsvpError.message);
      continue;
    }
    const rows = rsvps ?? [];
    const going = rows.filter((row) => row.status === 'going').length;
    for (const rsvp of rows) {
      if (rsvp.user_id === event.host_user_id) continue; // hosts know their own event
      await insertNotification(admin, {
        userId: rsvp.user_id,
        type: 'event_reminder',
        entityType: 'event',
        entityId: event.id,
        payload: {
          eventSlug: event.slug,
          title: event.title,
          startsAt: event.starts_at,
          timezone: event.timezone,
          going,
          capacity: event.capacity,
          status: rsvp.status,
        },
      });
      remindersSent += 1;
    }
  }

  return { eventsClaimed: (claimed ?? []).length, remindersSent };
}
