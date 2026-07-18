'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client';
import type { NotificationBundle } from '@/lib/notifications/bundle';
import type { PlainError } from '@/lib/errors';
import { createClient } from '@/lib/supabase-browser';

import { bundleHref, bundleSummary } from '@/lib/notifications/present';
import { toast } from '@/lib/toast';

import { EmptyState } from '../empty-state';
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
      toast('notif.allRead');
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
        <EmptyState className="xidig-empty-sky" messageKey="notif.empty" />
      ) : (
        <ul className="xidig-notif-list">
          {bundles.map((b) => {
            const href = bundleHref(b);
            const content = (
              <>
                {b.unread ? <span className="xidig-notif__dot" aria-hidden="true" /> : null}
                <span className="xidig-notif__text">{bundleSummary(b, t)}</span>
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
