'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { MediaSlot } from '@/components/media/media-slot';
import { BookmarkButton } from '@/components/social/bookmark-button';
import { LOW_BANDWIDTH_COOKIE, parseLowBandwidthCookieValue } from '@/lib/bandwidth';
import { LITE_BUNDLES, LITE_COOKIE, parseLitePrefs, type LitePrefs } from '@/lib/lite/prefs';

import { OpenNowChip } from './opening-hours-display';
import { PriceRangeDisplay } from './price-range';

/**
 * Compact listing card (§18) — used by the directory Businesses tab, the map
 * list fallback, and the Following feed. Links to the /l/[id] permalink.
 *
 * Phase 4.5: primary-photo thumbnail (MediaSlot — blurhash placeholder +
 * "Show" tap in Lite mode), price range, "Open now" chip, and a bookmark
 * button. All new ListingRow fields are OPTIONAL so call sites that select
 * narrower columns (feed, map) keep working — the card renders an initials
 * glyph box when no photo data is present.
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
  /** Phase 4.5 columns — optional: older call sites select narrower rows. */
  opening_hours?: unknown;
  price_range?: number | null;
  primary_photo_url?: string | null;
  primary_photo_thumb_url?: string | null;
  primary_photo_blurhash?: string | null;
  primary_photo_alt?: string | null;
  photo_count?: number;
}

/** Rough weight of a 480px WebP thumb — the card never loads the full asset. */
const THUMB_EST_BYTES = 25_000;

/**
 * Lite prefs from the cookie, resolved after mount (the card renders in
 * surfaces whose pages don't pass prefs down — map list, feed). `null` until
 * known, so SSR and the first client render agree AND no image bytes move
 * before the viewer's Lite choice is known (§22: when in doubt, defer).
 */
function useCookieLitePrefs(): LitePrefs | null {
  const [prefs, setPrefs] = useState<LitePrefs | null>(null);
  useEffect(() => {
    const read = (name: string): string | undefined =>
      document.cookie
        .split('; ')
        .find((row) => row.startsWith(`${name}=`))
        ?.slice(name.length + 1);
    const parsed = parseLitePrefs(read(LITE_COOKIE));
    if (parsed) setPrefs(parsed);
    else if (parseLowBandwidthCookieValue(read(LOW_BANDWIDTH_COOKIE)))
      setPrefs(LITE_BUNDLES.essentials);
    else setPrefs(LITE_BUNDLES.everything);
  }, []);
  return prefs;
}

export function ListingCard({
  listing,
  byline,
  prefs,
  signedIn,
  bookmarked,
}: {
  listing: ListingRow;
  byline?: string | undefined;
  /** Granular Lite prefs; falls back to the cookie when absent. */
  prefs?: LitePrefs | undefined;
  /**
   * Render the bookmark button (undefined = don't — surfaces that haven't
   * opted in keep their exact pre-4.5 layout).
   */
  signedIn?: boolean | undefined;
  bookmarked?: boolean | undefined;
}) {
  const t = useT();
  const cookiePrefs = useCookieLitePrefs();
  const litePrefs = prefs ?? cookiePrefs;

  const location = [listing.city, listing.country].filter(Boolean).join(', ');
  const thumbUrl = listing.primary_photo_thumb_url ?? listing.primary_photo_url ?? null;

  return (
    <li className="xidig-card xidig-listing-card">
      <div className="xidig-listing-card__thumb">
        {thumbUrl && litePrefs ? (
          <MediaSlot
            kind="image"
            src={thumbUrl}
            thumbSrc={thumbUrl}
            blurhash={listing.primary_photo_blurhash}
            alt={listing.primary_photo_alt ?? listing.business_name}
            estBytes={THUMB_EST_BYTES}
            prefs={litePrefs}
          />
        ) : (
          // 0-byte fallback: initials glyph box (also the pre-prefs frame, so
          // nothing downloads before the viewer's Lite choice is known).
          <span className="xidig-listing-card__glyph" aria-hidden="true">
            {listing.business_name.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="xidig-listing-card__body">
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
          <PriceRangeDisplay level={listing.price_range} />
          {listing.opening_hours !== undefined && listing.opening_hours !== null ? (
            <OpenNowChip hours={listing.opening_hours} />
          ) : null}
        </p>
        {signedIn !== undefined ? (
          <BookmarkButton
            entityType="listing"
            entityId={listing.id}
            signedIn={signedIn}
            {...(bookmarked !== undefined ? { initialBookmarked: bookmarked } : {})}
          />
        ) : null}
      </div>
    </li>
  );
}
