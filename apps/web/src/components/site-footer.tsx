'use client';

import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { MARKETING_LINKS } from '@/lib/external-links';

/**
 * Site footer. Since the Phase A front door (docs/front-door-plan.md) the
 * legal + about pages live INSIDE this app, so these are internal routes via
 * next/link (they used to be plain anchors out to the old marketing site).
 *
 * Client component so the labels re-render on a language toggle without a page
 * reload, matching the header nav.
 */
const FOOTER_LINKS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'footer.about', href: MARKETING_LINKS.about },
  { labelKey: 'footer.privacy', href: MARKETING_LINKS.privacy },
  { labelKey: 'footer.terms', href: MARKETING_LINKS.terms },
  { labelKey: 'marketing.contactTitle', href: '/contact' },
];

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="xidig-footer">
      <p className="xidig-footer__mark">
        <AnimatedMark mode="static" size={18} />
      </p>
      <nav aria-label={t('a11y.footerNav')} className="xidig-footer__nav">
        <ul className="xidig-footer__list">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{t(link.labelKey)}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
