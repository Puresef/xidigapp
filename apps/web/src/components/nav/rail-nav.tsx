'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { useBadges } from '@/components/nav/badge-provider';
import { CreateButton } from '@/components/nav/create-button';
import { HeaderSearch } from '@/components/nav/header-search';
import { UserMenu } from '@/components/nav/user-menu';
import type { HeaderViewer } from '@/lib/auth/header-viewer';

/**
 * RailNav — the desktop app shell per the design canon (RailNav.dc.html,
 * Codsi fidelity pass 9 Aug). At ≥64rem the rail replaces the top header:
 * brand, five destinations (Hoy · Madal · Suuq · Warshad · Maal), Abuur,
 * search, then the quiet bottom third — Fariimo and Digniino with their
 * per-destination counts (ruling 3 as amended: calm accent, never red) and
 * the account row. Below 64rem the rail hides and the existing header/bottom
 * bar carry on unchanged — both shells stay in the DOM and CSS flips them,
 * the same zero-flash pattern as the mobile tab portal.
 *
 * Canon deviations, all flagged in the dispatch report: the rail carries the
 * global search (the canon rail has none and no desktop header remains to
 * hold it); Digniino is a plain link to /notifications (the header bell's
 * quick-peek panel stays a sub-64rem affordance); the Digniino label follows
 * the LOCKED vocabulary (canon says "Ogeysiisyo").
 */

const RAIL_ITEMS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'nav.home', href: '/' },
  { labelKey: 'nav.plaza', href: '/plaza' },
  { labelKey: 'nav.suuq', href: '/suuq' },
  { labelKey: 'nav.labs', href: '/labs' },
  { labelKey: 'nav.capital', href: '/capital' },
];

/** Canon rail glyphs (RailNav.dc.html) — Maal is the xidhmo sheaf nav variant
 * (ruling 8: 1.8/1.3 weights). Decorative; the row label names the item. */
function RailIcon({ href }: { href: string }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 21,
    height: 21,
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
          <path d="M3.5 11 12 3.8 20.5 11" />
          <path d="M5.8 9.6v10.6h12.4V9.6" />
        </svg>
      );
    case '/plaza':
      return (
        <svg {...common}>
          <circle cx="8.6" cy="8.4" r="3.1" />
          <path d="M3.2 19.6c.5-3 2.7-4.8 5.4-4.8s4.9 1.8 5.4 4.8" />
          <circle cx="16.6" cy="9.4" r="2.5" />
          <path d="M16.2 14.9c2.4.1 4.2 1.7 4.6 4.2" />
        </svg>
      );
    case '/suuq':
      return (
        <svg {...common}>
          <path d="M5.8 7.6h12.4l-1.1 12.6H6.9Z" />
          <path d="M9 10.2V6.8a3 3 0 0 1 6 0v3.4" />
        </svg>
      );
    case '/labs':
      return (
        <svg {...common}>
          <path d="M9.6 3.4h4.8" />
          <path d="M10.4 3.4v4.9L5.3 17.8a2.1 2.1 0 0 0 1.9 3h9.6a2.1 2.1 0 0 0 1.9-3L13.6 8.3V3.4" />
          <path d="M7.8 14.2h8.4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 20.4V5.2" />
          <path d="M12 20.4 7.2 6.6" />
          <path d="m12 20.4 4.8-13.8" />
          <path strokeWidth={1.3} d="M8.6 13.2c2.2.9 4.6.9 6.8 0" />
          <path strokeWidth={1.3} d="M9.3 15.6c1.8.7 3.6.7 5.4 0" />
        </svg>
      );
  }
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RailBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="xidig-nav__badge xidig-rail__badge" aria-label={String(count)}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function RailNav({ viewer }: { viewer: HeaderViewer }) {
  const t = useT();
  const pathname = usePathname();
  const { messages, notifications } = useBadges();

  return (
    <nav aria-label={t('a11y.mainNav')} className="xidig-rail">
      <Link href="/" className="xidig-rail__brand">
        <AnimatedMark mode="assemble" size={26} label={t('app.name')} />
        <span className="xidig-rail__wordmark">{t('app.name')}</span>
      </Link>

      {RAIL_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="xidig-rail__item"
          aria-current={isActive(pathname, item.href) ? 'page' : undefined}
        >
          <RailIcon href={item.href} />
          <span>{t(item.labelKey)}</span>
        </Link>
      ))}

      <div className="xidig-rail__create">
        <CreateButton />
      </div>
      <div className="xidig-rail__search">
        <HeaderSearch />
      </div>

      <span className="xidig-rail__spacer" />

      <Link
        href="/messages"
        className="xidig-rail__item xidig-rail__item--quiet"
        aria-current={isActive(pathname, '/messages') ? 'page' : undefined}
      >
        <span className="xidig-rail__iconwrap">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21.5 2.5 11 13" />
            <path d="M21.5 2.5 14.8 21l-3.8-8-8-3.8Z" />
          </svg>
          <RailBadge count={messages} />
        </span>
        <span>{t('nav.messages')}</span>
      </Link>
      <Link
        href="/notifications"
        className="xidig-rail__item xidig-rail__item--quiet"
        aria-current={isActive(pathname, '/notifications') ? 'page' : undefined}
      >
        <span className="xidig-rail__iconwrap">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          <RailBadge count={notifications} />
        </span>
        <span>{t('nav.notifications')}</span>
      </Link>

      <div className="xidig-rail__account">
        <UserMenu viewer={viewer} presentation="rail" />
      </div>
    </nav>
  );
}
