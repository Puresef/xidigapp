'use client';

import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { asContactLinks, contactHref } from '@/lib/listings';

/**
 * First-class direct-contact CTA near the top of the listing page (§18,
 * Phase 4.5). WhatsApp is THE Somali business channel (§28), so when the
 * listing has a whatsapp contact it gets a primary button above the fold
 * instead of only a row in the contact list — but the LABEL is
 * channel-nameless by ruling (11 Jul, directive-8 Option B —
 * docs/front-door-standard.md §5.2); the href still deep-links the listing's
 * chosen channel. Fires the same §23 `contact_click` event as
 * ListingContacts — the funnel tail doesn't care which affordance was tapped.
 */
export function WhatsAppCta({
  listingId,
  contactLinks,
}: {
  listingId: string;
  contactLinks: unknown;
}) {
  const t = useT();
  const whatsapp = asContactLinks(contactLinks).find((row) => row.type === 'whatsapp');
  const href = whatsapp ? contactHref('whatsapp', whatsapp.value) : null;
  if (!href) return null;

  return (
    <p>
      <a
        className="xidig-button xidig-button--primary"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
        onClick={() =>
          trackClient('contact_click', { listing_id: listingId, channel: 'whatsapp' })
        }
      >
        {t('suuq.whatsappCta')}
      </a>
    </p>
  );
}
