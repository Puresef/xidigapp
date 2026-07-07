'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { useBadges } from '@/components/nav/badge-provider';

/**
 * Notifications as a header bell icon (7 Jul nav review) rather than a text tab
 * — activity pings (reactions, mentions, Lab updates, Candidate status) are a
 * glance-and-tap surface, distinct from Messages (1:1 conversations). Live
 * unread badge from the shared BadgeProvider.
 */
export function NotificationBell() {
  const t = useT();
  const pathname = usePathname();
  const { notifications } = useBadges();
  const active = pathname === '/notifications' || pathname.startsWith('/notifications/');

  return (
    <Link
      href="/notifications"
      className="xidig-icon-button"
      aria-label={
        notifications > 0
          ? t('a11y.notificationsUnread', { count: notifications })
          : t('a11y.notifications')
      }
      aria-current={active ? 'page' : undefined}
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
    </Link>
  );
}
