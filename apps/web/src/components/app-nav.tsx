'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * Canonical tabs (Bilingual UI Copy & Naming System). Capital is reached from
 * inside Labs — no tab of its own (PRD decision log). Future-phase surfaces
 * (Plaza, Labs, Messages, Notifications) render a coming-soon state rather
 * than fake functionality; the labels are canonical now so every phase
 * inherits them. The create action (Abuur) is a header button, not a tab
 * (naming review 5 Jul).
 */
const NAV_ITEMS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'nav.home', href: '/' },
  { labelKey: 'nav.plaza', href: '/plaza' },
  { labelKey: 'nav.labs', href: '/labs' },
  { labelKey: 'nav.suuq', href: '/suuq' },
  { labelKey: 'nav.messages', href: '/messages' },
  { labelKey: 'nav.notifications', href: '/notifications' },
  { labelKey: 'nav.profile', href: '/profile' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  // /u/[handle] is the profile surface; keep Aniga lit there too.
  if (href === '/profile' && pathname.startsWith('/u/')) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const t = useT();
  const pathname = usePathname();
  return (
    <nav aria-label={t('a11y.mainNav')} className="xidig-nav">
      <ul className="xidig-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className="xidig-nav__item">
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              {t(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
