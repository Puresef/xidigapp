'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client';
import type { NotificationBundle } from '@/lib/notifications/bundle';
import type { PlainError } from '@/lib/errors';
import { createClient } from '@/lib/supabase-browser';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Notification inbox (§9). Renders bundled notifications (§22 smart bundling)
 * newest-first, each linking to the content it's about. "Mark all read" +
 * per-bundle mark-on-open keep the badge honest. Realtime: a new notification
 * row for the caller (RLS-scoped) re-syncs the list — no polling.
 */

interface NotifResponse {
  bundles: NotificationBundle[];
  unreadCount: number;
  nextCursor: string | null;
}

function bundleHref(b: NotificationBundle): string | null {
  if (b.entityType === 'conversation' && b.entityId) return `/messages/${b.entityId}`;
  if (b.entityType === 'post' && b.entityId) return `/p/${b.entityId}`;
  if (b.entityType === 'event' && typeof b.payload?.eventSlug === 'string') {
    return `/events/${b.payload.eventSlug}`;
  }
  const postId = b.payload?.postId;
  if (typeof postId === 'string') return `/p/${postId}`;
  return null;
}

export function NotificationsInbox({ initial }: { initial: NotifResponse }) {
  const t = useT();
  const { locale } = useLocale();
  const [bundles, setBundles] = useState<NotificationBundle[]>(initial.bundles);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const refetch = useCallback(async () => {
    try {
      const page = await apiGet<NotifResponse>('/api/notifications');
      setBundles(page.bundles);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      // '*' (not just INSERT) so a read / mark-all-read done in another tab or
      // on another device (a read_at UPDATE) re-syncs this open list too.
      .channel('notifications-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  function summary(b: NotificationBundle): string {
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

  function markRead(ids: string[]) {
    void apiPost('/api/notifications/read', { ids }).catch(() => {});
    setBundles((current) =>
      current.map((b) =>
        b.notificationIds.some((id) => ids.includes(id)) ? { ...b, unread: false } : b,
      ),
    );
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('xidig:badges'));
  }

  async function markAllRead() {
    setError(null);
    try {
      await apiPost('/api/notifications/read', { all: true });
      setBundles((current) => current.map((b) => ({ ...b, unread: false })));
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('xidig:badges'));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setPending(true);
    try {
      const page = await apiGet<NotifResponse>(
        `/api/notifications?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setBundles((current) => [...current, ...page.bundles]);
      setNextCursor(page.nextCursor);
    } catch {
      // keep what we have
    } finally {
      setPending(false);
    }
  }

  const anyUnread = bundles.some((b) => b.unread);

  return (
    <section aria-label={t('nav.notifications')}>
      {error ? <PlainErrorBanner error={error} /> : null}

      {anyUnread ? (
        <p className="xidig-toolbar">
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            onClick={() => void markAllRead()}
          >
            {t('notif.markAllRead')}
          </button>
        </p>
      ) : null}

      {bundles.length === 0 ? (
        <div className="xidig-section">
          <p className="xidig-card__body">{t('notif.empty')}</p>
        </div>
      ) : (
        <ul className="xidig-notif-list">
          {bundles.map((b) => {
            const href = bundleHref(b);
            const content = (
              <>
                {b.unread ? <span className="xidig-notif__dot" aria-hidden="true" /> : null}
                <span className="xidig-notif__text">{summary(b)}</span>
                <time className="xidig-card__meta" dateTime={b.latestAt}>
                  {formatRelativeTime(new Date(b.latestAt), locale)}
                </time>
              </>
            );
            return (
              <li key={b.id} className={`xidig-notif ${b.unread ? 'xidig-notif--unread' : ''}`}>
                {href ? (
                  <Link className="xidig-notif__link" href={href} onClick={() => markRead(b.notificationIds)}>
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="xidig-notif__link"
                    onClick={() => markRead(b.notificationIds)}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void loadMore()}
          >
            {t('action.loadMore')}
          </button>
        </p>
      ) : null}
    </section>
  );
}
