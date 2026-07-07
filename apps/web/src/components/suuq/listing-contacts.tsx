'use client';

import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { asContactLinks, contactHref } from '@/lib/listings';

/**
 * Listing contact links (§18) with §23 `contact_click` tracking — the tail of
 * the §4 funnel (map views → listing views → contact clicks). Channel names
 * are taxonomy tokens (whatsapp/phone/email/...), rendered as-is. The parse/
 * href helpers live in lib/listings.ts (Phase 4.5 — shared with the WhatsApp
 * CTA and the server-side edit page).
 */

export function ListingContacts({
  listingId,
  contactLinks,
}: {
  listingId: string;
  contactLinks: unknown;
}) {
  const t = useT();
  const rows = asContactLinks(contactLinks);
  if (rows.length === 0) return null;

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{t('suuq.contactHeading')}</h2>
      <ul className="xidig-invite-list">
        {rows.map((row, index) => {
          const href = contactHref(row.type, row.value);
          return (
            <li key={`${row.type}-${index}`} className="xidig-invite-list__item">
              <span>{row.label ?? row.type}</span>
              {href ? (
                <a
                  href={href}
                  rel="noopener noreferrer"
                  target="_blank"
                  onClick={() =>
                    trackClient('contact_click', { listing_id: listingId, channel: row.type })
                  }
                >
                  {row.value}
                </a>
              ) : (
                <span>{row.value}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
