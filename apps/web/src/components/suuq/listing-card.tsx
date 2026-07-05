'use client';

import Link from 'next/link';

import { useT } from '@xidig/i18n/react';

/**
 * Compact listing card (§18) — used by the directory Businesses tab, the map
 * list fallback, and the Following feed. Links to the /l/[id] permalink.
 */

export interface ListingRow {
  id: string;
  owner_user_id: string | null;
  business_name: string;
  category_id: string;
  short_description: string | null;
  address: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  contact_links: unknown;
  verification_status: string;
  status: string;
  created_at: string;
}

export function ListingCard({
  listing,
  byline,
}: {
  listing: ListingRow;
  byline?: string | undefined;
}) {
  const t = useT();
  const location = [listing.city, listing.country].filter(Boolean).join(', ');
  return (
    <li className="xidig-card">
      <h3 className="xidig-card__title">
        <Link href={`/l/${listing.id}`}>{listing.business_name}</Link>
      </h3>
      {byline ? <p className="xidig-card__meta">{byline}</p> : null}
      {location ? <p className="xidig-card__meta">{location}</p> : null}
      {listing.short_description ? (
        <p className="xidig-card__body">{listing.short_description}</p>
      ) : null}
      <p className="xidig-chip-row">
        {listing.verification_status === 'verified' ? (
          <span className="xidig-tag xidig-tag--ok">{t('suuq.verifiedBusiness')}</span>
        ) : null}
        {listing.owner_user_id === null ? (
          <span className="xidig-tag">{t('suuq.unclaimed')}</span>
        ) : null}
      </p>
    </li>
  );
}
