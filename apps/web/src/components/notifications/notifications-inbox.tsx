'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiGet, apiPost } from '@/lib/api-client';
import type { NotificationBundle } from '@/lib/notifications/bundle';
import type { PlainError } from '@/lib/errors';
import { createClient } from '@/lib/supabase-browser';

import { bundleExtras, bundleHref, bundleSummary } from '@/lib/notifications/present';
import { toast } from '@/lib/toast';

import { Avatar } from '../media/avatar';
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

/** e7 Digniino reminder row: accent-soft calendar disc (never an avatar —
 * these are system rows, no actor). Matches the design frame's glyph. */
function ReminderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="5.5" width="16" height="15" rx="2" />
      <path d="M4 10.5h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

export function NotificationsInbox({ initial }: { initial: NotifResponse }) {
  const t = useT();
  const { locale } = useLocale();
  const [bundles, setBundles] = useState<NotificationBundle[]>(initial.bundles);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  // Event slug currently mid-cancel (Digniino reminder row unrsvp action) —
  // disables its own button only, never the whole list.
  const [unrsvping, setUnrsvping] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const page = await apiGet<NotifResponse>('/api/notifications');
      setBundles(page.bundles);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      // Offline/proxy failures have no PlainError payload — normalize to the
      // generic server_error so the banner still renders (empty message →
      // PlainErrorBanner falls back to error.server copy).
      else setError({ code: 'server_error', message: '' });
    }
  }, []);

  // Digniino reminder row "Ka noqo RSVP" (Task 7): cancel the RSVP behind
  // the reminder, then reuse the same refetch the realtime subscription
  // already drives — no bespoke local-state patch to keep in sync.
  async function handleUnrsvp(eventSlug: string) {
    setUnrsvping(eventSlug);
    setError(null);
    try {
      await apiDelete(`/api/events/${eventSlug}/rsvp`);
      await refetch();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setUnrsvping(null);
    }
  }

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
            const extras = bundleExtras(b, t);
            const timeEl = (
              <time className="xidig-card__meta" dateTime={b.latestAt}>
                {formatRelativeTime(new Date(b.latestAt), locale)}
              </time>
            );

            // e7 Digniino reminder row: bespoke meta line + inline actions
            // (Task 7). Two real controls (view / unrsvp) can't nest inside
            // one outer <Link>, so this row isn't itself a single click
            // target the way every other bundle type is — each action owns
            // its own click.
            if (extras.actions.length > 0) {
              return (
                <li key={b.id} className={`xidig-notif ${b.unread ? 'xidig-notif--unread' : ''}`}>
                  <div className="xidig-notif__link xidig-notif__link--static">
                    {b.unread ? <span className="xidig-notif__dot" aria-hidden="true" /> : null}
                    <span className="xidig-notif__icon">
                      <ReminderIcon />
                    </span>
                    <span className="xidig-notif__body">
                      <span className="xidig-notif__text">{bundleSummary(b, t)}</span>
                      {extras.meta ? <span className="xidig-notif__meta">{extras.meta}</span> : null}
                      <span className="xidig-notif__actions">
                        {extras.actions.map((action) =>
                          action.kind === 'unrsvp' ? (
                            <button
                              key={action.labelKey}
                              type="button"
                              className="xidig-notif__action xidig-notif__action--muted"
                              disabled={unrsvping === action.eventSlug}
                              onClick={() => void handleUnrsvp(action.eventSlug!)}
                            >
                              {t(action.labelKey)}
                            </button>
                          ) : (
                            <Link
                              key={action.labelKey}
                              href={action.href!}
                              className="xidig-notif__action"
                              onClick={() => markRead(b.notificationIds)}
                            >
                              {t(action.labelKey)}
                            </Link>
                          ),
                        )}
                      </span>
                    </span>
                    {timeEl}
                  </div>
                </li>
              );
            }

            // Most-recent actor → zero-byte initials disc (bundle actors carry
            // handle+name only — no avatar fields; thumb hydration would be an
            // API change, deliberately out of scope). Actor-less system rows
            // (moderation, Ask lifecycle) render no disc — never an empty gap.
            const actor = b.actors[0];
            const content = (
              <>
                {b.unread ? <span className="xidig-notif__dot" aria-hidden="true" /> : null}
                {actor ? (
                  <Avatar
                    name={actor.displayName || actor.handle}
                    handle={actor.handle}
                    size={28}
                  />
                ) : null}
                <span className="xidig-notif__text">{bundleSummary(b, t)}</span>
                {timeEl}
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
