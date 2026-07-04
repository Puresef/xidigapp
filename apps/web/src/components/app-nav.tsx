'use client';

import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * Canonical tabs (Bilingual UI Copy & Naming System). Capital is reached from
 * inside Labs — no tab of its own (PRD decision log). Routes will fill in as
 * their phases land; the labels are canonical now so every phase inherits them.
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

export function AppNav() {
  const t = useT();
  return (
    <nav aria-label={t('a11y.mainNav')} className="xidig-nav">
      <ul className="xidig-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.href} className="xidig-nav__item">
            <Link href={item.href}>{t(item.labelKey)}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
