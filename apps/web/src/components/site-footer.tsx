'use client';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { MARKETING_LINKS } from '@/lib/external-links';

/**
 * Site footer — the app half of the xidig.net ↔ app.xidig.net unified
 * experience. Legal + about pages live on the marketing site (xidig.net), so
 * the app links out to them rather than duplicating the content. Plain anchors
 * (not next/link) because these leave the app to another origin.
 *
 * Client component so the labels re-render on a language toggle without a page
 * reload, matching the header nav.
 */
const FOOTER_LINKS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'footer.about', href: MARKETING_LINKS.about },
  { labelKey: 'footer.privacy', href: MARKETING_LINKS.privacy },
  { labelKey: 'footer.terms', href: MARKETING_LINKS.terms },
];

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="xidig-footer">
      <nav aria-label={t('a11y.footerNav')} className="xidig-footer__nav">
        <ul className="xidig-footer__list">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href}>{t(link.labelKey)}</a>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
