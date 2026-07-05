'use client';

import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';

/**
 * Listing contact links (§18) with §23 `contact_click` tracking — the tail of
 * the §4 funnel (map views → listing views → contact clicks). Channel names
 * are taxonomy tokens (whatsapp/phone/email/...), rendered as-is.
 */

interface ContactLink {
  type: string;
  label?: string;
  value: string;
}

function asContactLinks(value: unknown): ContactLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is ContactLink =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as ContactLink).type === 'string' &&
      typeof (row as ContactLink).value === 'string',
  );
}

function contactHref(type: string, value: string): string | null {
  if (type === 'whatsapp') {
    const digits = value.replace(/[^0-9]/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }
  if (type === 'phone') {
    const tel = value.replace(/[^0-9+]/g, '');
    return tel ? `tel:${tel}` : null;
  }
  if (type === 'email') return `mailto:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (type === 'website' || type === 'facebook' || type === 'instagram') {
    return `https://${value}`;
  }
  return null;
}

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
