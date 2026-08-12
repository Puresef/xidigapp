import type { MessageKey, Translator } from '@xidig/i18n';

import { eventDateParts } from '@/lib/events/datetime';

import type { NotificationBundle } from './bundle';

/**
 * Bundle presenters shared by every notification surface (the /notifications
 * inbox and the header bell dropdown): one human summary line and one
 * permalink per bundle, so the two lists can never drift apart.
 */

/**
 * Bespoke row extras (Task 7, e7 Digniino reminder). `{meta: null,
 * actions: []}` for every type except event_reminder — a plain summary/href
 * row is the default, and only reminders currently earn the richer meta line
 * + inline actions the design frame (e7) specifies. `kind: 'unrsvp'` carries
 * no href — the inbox renders it as a button (DELETE the RSVP, then
 * refetch), never a link.
 */
export interface BundleExtras {
  meta: string | null;
  actions: Array<{ labelKey: MessageKey; href?: string; kind?: 'unrsvp'; eventSlug?: string }>;
}

const NO_EXTRAS: BundleExtras = { meta: null, actions: [] };

/**
 * event_reminder extras from the Task 4 send-time snapshot payload
 * (`{ eventSlug, title, startsAt, timezone, going, capacity, status }`).
 * LEGACY rows predate that payload and carry only `{ eventSlug }` — missing
 * `title` is the signal (bundleSummary already degrades those to
 * notif.generic), so this returns NO_EXTRAS rather than a meta line built on
 * absent fields.
 */
export function bundleExtras(b: NotificationBundle, t: Translator): BundleExtras {
  if (b.type !== 'event_reminder') return NO_EXTRAS;

  const payload = b.payload;
  const eventSlug = typeof payload?.eventSlug === 'string' ? payload.eventSlug : null;
  const title = typeof payload?.title === 'string' ? payload.title : null;
  if (!eventSlug || !title) return NO_EXTRAS;

  const startsAt = typeof payload?.startsAt === 'string' ? payload.startsAt : null;
  const timezone = typeof payload?.timezone === 'string' ? payload.timezone : null;
  const going = typeof payload?.going === 'number' ? payload.going : null;
  const capacity = typeof payload?.capacity === 'number' ? payload.capacity : null;
  const status =
    payload?.status === 'going' || payload?.status === 'interested' ? payload.status : null;

  let meta: string | null = null;
  if (startsAt && timezone && going !== null && status) {
    const parts = eventDateParts(t, startsAt, null, timezone);
    const when = `${parts.weekday} ${parts.time}`;
    const hasCapacity = capacity !== null;
    const key: MessageKey =
      status === 'going'
        ? hasCapacity
          ? 'notif.eventReminderMetaGoing'
          : 'notif.eventReminderMetaGoingNoCap'
        : hasCapacity
          ? 'notif.eventReminderMetaInterested'
          : 'notif.eventReminderMetaInterestedNoCap';
    meta = hasCapacity ? t(key, { when, going, capacity: capacity! }) : t(key, { when, going });
  }

  const actions: BundleExtras['actions'] = [{ labelKey: 'action.view', href: `/events/${eventSlug}` }];
  // Legacy rows never reach here (title guard above); a status-less row on
  // the CURRENT payload shape shouldn't exist either, but the guard keeps
  // this action honest about what it can act on.
  if (status) {
    actions.push({ labelKey: 'events.reminderCancelRsvp', kind: 'unrsvp', eventSlug });
  }

  return { meta, actions };
}

export function bundleHref(b: NotificationBundle): string | null {
  if (b.entityType === 'conversation' && b.entityId) return `/messages/${b.entityId}`;
  if (b.entityType === 'post' && b.entityId) return `/p/${b.entityId}`;
  if (b.entityType === 'event' && typeof b.payload?.eventSlug === 'string') {
    return `/events/${b.payload.eventSlug}`;
  }
  const postId = b.payload?.postId;
  if (typeof postId === 'string') return `/p/${postId}`;
  return null;
}

export function bundleSummary(b: NotificationBundle, t: Translator): string {
  const actor = b.actors[0];
  const name = actor?.displayName || actor?.handle || '';
  const extra = Math.max(0, b.actorCount - 1);
  switch (b.type) {
    case 'reply':
      return extra > 0 ? t('notif.replyBundle', { name, count: extra }) : t('notif.reply', { name });
    case 'mention':
      return extra > 0
        ? t('notif.mentionBundle', { name, count: extra })
        : t('notif.mention', { name });
    case 'new_dm':
      return t('notif.newDm', { name, count: b.count });
    case 'dm_request':
      return t('notif.dmRequest', { name });
    case 'dm_accepted':
      return t('notif.dmAccepted', { name });
    case 'ask_credited':
      return t('notif.askCredited');
    case 'ask_helper_named':
      return t('notif.askHelperNamed');
    case 'ask_stale':
      return t('notif.askStale');
    case 'moderation_hold':
      return t('notif.moderationHold');
    case 'moderation_removed':
      return t('notif.moderationRemoved');
    case 'candidate_status':
      return t('notif.candidateStatus');
    case 'event_rsvp':
      return b.count > 1
        ? t('notif.eventRsvpBundle', { count: b.count })
        : t('notif.eventRsvp', { name });
    case 'event_cancelled':
      return t('notif.eventCancelled');
    case 'mentor_slot_booked': {
      // `when` is a plain formatted string baked in at write time (the
      // booking route's own request locale) — mentor slots carry no
      // per-recipient timezone to re-render against later, unlike
      // event_reminder's raw startsAt/timezone payload.
      const when = typeof b.payload?.when === 'string' ? b.payload.when : '';
      return t('notif.mentorSlotBooked', { name, when });
    }
    case 'venture_demotion_warning':
    case 'venture_demoted': {
      // The venture's name is baked in at write time (the sweep has no request
      // locale to re-render against later, and a Space name is not translated
      // anyway). A row with no name predates the payload and degrades to the
      // generic line rather than rendering a bare "{name}".
      const ventureName = typeof b.payload?.name === 'string' ? b.payload.name : null;
      if (!ventureName) return t('notif.generic');
      return t(
        b.type === 'venture_demoted' ? 'notif.ventureDemoted' : 'notif.ventureDemotionWarning',
        { name: ventureName },
      );
    }
    case 'event_reminder': {
      // Task 4 payload carries the send-time title; LEGACY rows (pre-Task-4)
      // only have { eventSlug } — no title means no safe interpolation, so
      // those degrade to the same generic line every other unknown-shape
      // notification gets, rather than rendering a bare "{title}" token.
      const title = typeof b.payload?.title === 'string' ? b.payload.title : null;
      return title ? t('notif.eventReminder', { title }) : t('notif.generic');
    }
    default:
      return t('notif.generic');
  }
}
