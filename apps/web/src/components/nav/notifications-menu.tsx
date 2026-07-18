'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { PlainErrorBanner } from '@/components/auth/plain-error';
import { useBadges } from '@/components/nav/badge-provider';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { NotificationBundle } from '@/lib/notifications/bundle';
import { bundleHref, bundleSummary } from '@/lib/notifications/present';
import { toast } from '@/lib/toast';

/**
 * Notifications as a bell DROPDOWN (18 Jul nav review) — glance-and-tap from
 * any page, mirroring the UserMenu pattern (same open/close, outside-click,
 * Escape-restores-focus, roving menuitem focus). The unread badge stays wired
 * to the shared BadgeProvider; the panel lazy-fetches the first bundles only
 * when opened (§22: no speculative requests). The full /notifications page
 * remains the deep surface via "See all".
 *
 * Structure notes (review-hardened):
 * - role="menu" wraps ONLY menuitems (+ a role="group" footer); the
 *   loading/empty/loaded state lives in a sibling role="status" region so it
 *   is announced instead of being an invalid silent child of the menu.
 * - Mark-all-read is gated on the provider's authoritative unread count, not
 *   the panel's 8-item slice, and moves focus to See-all before unmounting.
 * - A generation counter drops fetch responses that resolve after a local
 *   mark-read, so optimistic state is never clobbered by a stale snapshot.
 */

const PANEL_SIZE = 8;

export function NotificationsMenu() {
  const t = useT();
  const { locale } = useLocale();
  const pathname = usePathname();
  const { notifications } = useBadges();
  const [open, setOpen] = useState(false);
  const [bundles, setBundles] = useState<NotificationBundle[] | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const seeAllRef = useRef<HTMLAnchorElement>(null);
  // Bumped by local mark-read mutations; in-flight GETs from before the bump
  // are stale server snapshots and get dropped.
  const generationRef = useRef(0);

  const close = useCallback(() => setOpen(false), []);

  const closeAndRestore = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const menuItems = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }, []);

  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();
  }, [open, menuItems]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeAndRestore();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, closeAndRestore]);

  // Fetch the panel's bundles on every open — the badge may have moved on
  // since the last look, and the request is one the member just asked for.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const generation = generationRef.current;
    setError(null);
    apiGet<{ bundles: NotificationBundle[] }>('/api/notifications')
      .then((page) => {
        if (cancelled || generationRef.current !== generation) return;
        setBundles(page.bundles.slice(0, PANEL_SIZE));
      })
      .catch((cause: unknown) => {
        if (cancelled || generationRef.current !== generation) return;
        setError(cause instanceof ApiRequestError ? cause.plain : { code: 'server_error', message: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  function markRead(ids: string[]) {
    generationRef.current += 1;
    void apiPost('/api/notifications/read', { ids })
      .then(() => window.dispatchEvent(new Event('xidig:badges')))
      .catch(() => {});
    setBundles((current) =>
      current
        ? current.map((b) => (b.notificationIds.some((id) => ids.includes(id)) ? { ...b, unread: false } : b))
        : current,
    );
  }

  function markAllRead() {
    // The button is about to unmount — park keyboard focus on See-all first.
    seeAllRef.current?.focus();
    generationRef.current += 1;
    void apiPost('/api/notifications/read', { all: true })
      .then(() => window.dispatchEvent(new Event('xidig:badges')))
      .catch(() => {});
    setBundles((current) => (current ? current.map((b) => ({ ...b, unread: false })) : current));
    toast('notif.allRead');
  }

  // Authoritative: the provider counts ALL unread rows — the panel's 8-item
  // slice may be fully read while an older bundle still holds the badge up.
  const anyUnread = notifications > 0;

  // usePathname is typed string but is null outside a router (static render).
  const onNotificationsPage =
    pathname === '/notifications' || Boolean(pathname?.startsWith('/notifications/'));

  const statusText = error
    ? ''
    : bundles === null
      ? t('state.loading')
      : bundles.length === 0
        ? t('notif.empty')
        : t('notif.loadedCount', { count: bundles.length });

  return (
    <div className="xidig-user-menu xidig-notif-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="xidig-icon-button"
        aria-label={
          notifications > 0
            ? t('a11y.notificationsUnread', { count: notifications })
            : t('a11y.notifications')
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {notifications > 0 ? (
          <span className="xidig-nav__badge xidig-icon-button__badge" aria-hidden="true">
            {notifications > 99 ? '99+' : notifications}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="xidig-user-menu__panel"
          ref={panelRef}
          onKeyDown={onPanelKeyDown}
          aria-busy={bundles === null && !error}
        >
          {error ? <PlainErrorBanner error={error} /> : null}

          {/* One persistent live region: announces loading → loaded/empty. */}
          <p
            role="status"
            className={
              bundles !== null && bundles.length > 0 && !error
                ? 'xidig-visually-hidden'
                : 'xidig-notif-menu__empty'
            }
          >
            {statusText}
          </p>

          <div role="menu">
            {(bundles ?? []).map((b) => {
              const href = bundleHref(b);
              const content = (
                <>
                  {b.unread ? <span className="xidig-notif__dot" aria-hidden="true" /> : null}
                  <span className="xidig-notif-menu__text">{bundleSummary(b, t)}</span>
                  <time className="xidig-card__meta" dateTime={b.latestAt}>
                    {formatRelativeTime(new Date(b.latestAt), locale)}
                  </time>
                </>
              );
              return href ? (
                <Link
                  key={b.id}
                  href={href}
                  role="menuitem"
                  className="xidig-user-menu__item xidig-notif-menu__item"
                  onClick={() => {
                    markRead(b.notificationIds);
                    close();
                  }}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={b.id}
                  type="button"
                  role="menuitem"
                  className="xidig-user-menu__item xidig-notif-menu__item"
                  onClick={() => markRead(b.notificationIds)}
                >
                  {content}
                </button>
              );
            })}

            <div role="group" className="xidig-notif-menu__footer">
              {anyUnread ? (
                <button type="button" role="menuitem" className="xidig-user-menu__item" onClick={markAllRead}>
                  {t('notif.markAllRead')}
                </button>
              ) : null}
              <Link
                ref={seeAllRef}
                href="/notifications"
                role="menuitem"
                className="xidig-user-menu__item"
                aria-current={onNotificationsPage ? 'page' : undefined}
                onClick={close}
              >
                {t('notif.viewAll')}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
