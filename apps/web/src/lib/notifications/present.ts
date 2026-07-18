import type { Translator } from '@xidig/i18n';

import type { NotificationBundle } from './bundle';

/**
 * Bundle presenters shared by every notification surface (the /notifications
 * inbox and the header bell dropdown): one human summary line and one
 * permalink per bundle, so the two lists can never drift apart.
 */

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
    case 'event_reminder':
      return t('notif.eventReminder');
    default:
      return t('notif.generic');
  }
}
