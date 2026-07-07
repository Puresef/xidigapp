'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { useBadges } from '@/components/nav/badge-provider';

/**
 * Primary tabs (Bilingual UI Copy & Naming System). Trimmed to the core
 * destinations per PRD §8 IA: Home · Plaza · Labs · Suuq · Messages. The rest
 * moved off the tab row (7 Jul nav review): Search → header search box,
 * Notifications → header bell, Profile/Saved/Settings → the account menu.
 * Capital is reached from inside Labs (no tab of its own); the create action
 * (Abuur) is a header button.
 *
 * The Messages tab carries a live unread badge (§22/§26) from the shared
 * BadgeProvider — the count is fetched once for the whole header.
 */
const NAV_ITEMS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'nav.home', href: '/' },
  { labelKey: 'nav.plaza', href: '/plaza' },
  { labelKey: 'nav.labs', href: '/labs' },
  { labelKey: 'nav.suuq', href: '/suuq' },
  { labelKey: 'nav.messages', href: '/messages' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const t = useT();
  const pathname = usePathname();
  const { messages } = useBadges();

  return (
    <nav aria-label={t('a11y.mainNav')} className="xidig-nav">
      <ul className="xidig-nav__list">
        {NAV_ITEMS.map((item) => {
          const badge = item.href === '/messages' ? messages : 0;
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
