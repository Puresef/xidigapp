'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
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

/**
 * Decorative tab icons (18 Jul mobile nav): the bottom bar stacks icon over
 * label; desktop hides them via CSS. Same 1.8 round stroke as the bell.
 */
function NavIcon({ href }: { href: string }) {
  const common = {
    className: 'xidig-nav__icon',
    viewBox: '0 0 24 24',
    width: 22,
    height: 22,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const;
  switch (href) {
    case '/':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20a1 1 0 0 0 1 1h4v-6h3v6h4a1 1 0 0 0 1-1V9.5" />
        </svg>
      );
    case '/plaza':
      return (
        <svg {...common}>
          <path d="M3 11l14-5v12L3 13v-2Z" />
          <path d="M17 8.5a4 4 0 0 1 0 7" />
          <path d="M7 13.5V19a1.5 1.5 0 0 0 3 0v-4.5" />
        </svg>
      );
    case '/labs':
      return (
        <svg {...common}>
          <path d="M9.5 3h5" />
          <path d="M10.5 3v6.2L5 18.5A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 1.8-2.5L13.5 9.2V3" />
          <path d="M7.5 15h9" />
        </svg>
      );
    case '/suuq':
      return (
        <svg {...common}>
          <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H4l2-3.2A8 8 0 1 1 21 12Z" />
        </svg>
      );
  }
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const t = useT();
  const pathname = usePathname();
  const { messages } = useBadges();

  return (
    // --app modifier scopes the mobile bottom-bar CSS to the signed-in nav —
    // the signed-out FrontNav shares the base classes and must never be
    // captured by it.
    <nav aria-label={t('a11y.mainNav')} className="xidig-nav xidig-nav--app">
      {/* Brand mark joins the signed-in chrome too (mark-redesign sweep):
          mark-only to keep the crowded header tight; the label names it. */}
      <Link href="/" className="xidig-brand">
        <AnimatedMark mode="assemble" size={20} label={t('app.name')} />
      </Link>
      <ul className="xidig-nav__list">
        {NAV_ITEMS.map((item) => {
          const badge = item.href === '/messages' ? messages : 0;
          return (
            <li key={item.href} className="xidig-nav__item">
              <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined}>
                <NavIcon href={item.href} />
                <span className="xidig-nav__label">{t(item.labelKey)}</span>
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
