'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { apiGet } from '@/lib/api-client';
import { createClient } from '@/lib/supabase-browser';

/**
 * Canonical tabs (Bilingual UI Copy & Naming System). Capital is reached from
 * inside Labs — no tab of its own (PRD decision log). The create action
 * (Abuur) is a header button, not a tab (naming review 5 Jul).
 *
 * Phase 3: Messages + Notifications carry live unread badges (§22/§26). Counts
 * seed from /api/notifications/summary and stay current over Realtime (a new
 * notification row for the caller — RLS-scoped) plus a `xidig:badges` window
 * event the inbox surfaces dispatch after marking things read.
 */
const NAV_ITEMS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'nav.home', href: '/' },
  { labelKey: 'nav.plaza', href: '/plaza' },
  { labelKey: 'nav.labs', href: '/labs' },
  { labelKey: 'nav.suuq', href: '/suuq' },
  // Phase 4.5: cross-entity search + bookmarks + the settings hub.
  { labelKey: 'nav.search', href: '/search' },
  { labelKey: 'nav.saved', href: '/saved' },
  { labelKey: 'nav.messages', href: '/messages' },
  { labelKey: 'nav.notifications', href: '/notifications' },
  { labelKey: 'nav.profile', href: '/profile' },
  { labelKey: 'nav.settings', href: '/settings' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/profile' && pathname.startsWith('/u/')) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface Summary {
  notifications: number;
  messages: number;
}

export function AppNav() {
  const t = useT();
  const pathname = usePathname();
  const [counts, setCounts] = useState<Summary>({ notifications: 0, messages: 0 });
  const [signedIn, setSignedIn] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const summary = await apiGet<Summary>('/api/notifications/summary');
      setCounts({ notifications: summary.notifications, messages: summary.messages });
      setSignedIn(true);
    } catch {
      // 401 when signed out — no badges, no realtime.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-sync when a surface marks things read.
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener('xidig:badges', handler);
    return () => window.removeEventListener('xidig:badges', handler);
  }, [refresh]);

  // Live badge updates: a new notification for me (RLS-scoped) bumps the count.
  useEffect(() => {
    if (!signedIn) return;
    const supabase = createClient();
    const channel = supabase
      // '*' so a new notification (INSERT) AND a read elsewhere (read_at
      // UPDATE) both re-sync the badge counts across tabs/devices.
      .channel('nav-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [signedIn, refresh]);

  function badgeFor(href: string): number {
    if (href === '/messages') return counts.messages;
    if (href === '/notifications') return counts.notifications;
    return 0;
  }

  return (
    <nav aria-label={t('a11y.mainNav')} className="xidig-nav">
      <ul className="xidig-nav__list">
        {NAV_ITEMS.map((item) => {
          const badge = badgeFor(item.href);
          return (
            <li key={item.href} className="xidig-nav__item">
              <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
                {t(item.labelKey)}
                {badge > 0 ? (
                  <span className="xidig-nav__badge" aria-label={String(badge)}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
