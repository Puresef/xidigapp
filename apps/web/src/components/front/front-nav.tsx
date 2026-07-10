'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * Signed-out front-door nav (docs/front-door-plan.md §2). Deliberately light:
 * no BadgeProvider, no supabase-js, no polling — an anonymous visitor's header
 * is server-rendered links plus this tiny client component for active state.
 * Locked item set: Product · Labs · Capital · Reports · Membership.
 */
const NAV_ITEMS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'marketing.navProduct', href: '/product' },
  { labelKey: 'nav.labs', href: '/labs' },
  { labelKey: 'nav.capital', href: '/capital' },
  { labelKey: 'marketing.navReports', href: '/reports' },
  { labelKey: 'marketing.navMembership', href: '/membership' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FrontNav() {
  const t = useT();
  const pathname = usePathname();

  return (
    <nav aria-label={t('a11y.mainNav')} className="xidig-nav">
      <Link href="/" className="xidig-brand">
        {t('app.name')}
      </Link>
      <ul className="xidig-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className="xidig-nav__item">
            <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
              {t(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
