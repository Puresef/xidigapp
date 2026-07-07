'use client';

import { useT } from '@xidig/i18n/react';

import type { ListingServiceView } from '@/lib/listing-view';

/**
 * Services list on the listing detail page (§18, Phase 4.5) — a simple
 * name → price-label list; the price label is free text ("$5", "From 10 USD",
 * "La soo xiriir"), rendered as-is.
 */
export function ListingServicesList({ services }: { services: ListingServiceView[] }) {
  const t = useT();
  if (services.length === 0) return null;

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{t('suuq.servicesLabel')}</h2>
      <ul className="xidig-invite-list">
        {services.map((service, index) => (
          <li key={index} className="xidig-invite-list__item">
            <span>{service.name}</span>
            {service.priceLabel ? <span className="xidig-card__meta">{service.priceLabel}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
