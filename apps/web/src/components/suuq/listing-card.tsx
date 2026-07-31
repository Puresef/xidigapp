'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ContentSourceBadge } from '@/components/content-source-badge';
import { MediaSlot } from '@/components/media/media-slot';
import { BookmarkButton } from '@/components/social/bookmark-button';
import { trackClient } from '@/lib/analytics/client';
import { LOW_BANDWIDTH_COOKIE, parseLowBandwidthCookieValue } from '@/lib/bandwidth';
import { asContactLinks, contactHref } from '@/lib/listings';
import { LITE_BUNDLES, LITE_COOKIE, parseLitePrefs, type LitePrefs } from '@/lib/lite/prefs';

import { OpenNowChip } from './opening-hours-display';
import { PriceRangeDisplay } from './price-range';
import { VerifiedExplainer } from './verified-explainer';

/**
 * Compact listing card (§18) — used by the directory Businesses tab, the map
 * list fallback, and the Following feed. Links to the /l/[id] permalink.
 * The root element is polymorphic (`as`): 'li' by default for the <ul>
 * directory grids; 'div' where the caller supplies its own list item (the
 * feed's keyed <li>) or no list at all (the map preview panel) — a bare <li>
 * outside <ul>/<ol> is invalid DOM nesting and React errors on it.
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
  /** Task 11: approval date for the Verified explainer (optional — narrower
   *  call sites and seeded rows may not carry it; the dialog omits the line). */
  verified_at?: string | null;
  status: string;
  created_at: string;
  /** content_source ('member' | 'seed' | 'ai') — drives the seeded/AI label. */
  source?: string;
  /** Phase 4.5 columns — optional: older call sites select narrower rows. */
  opening_hours?: unknown;
  price_range?: number | null;
  primary_photo_url?: string | null;
  primary_photo_thumb_url?: string | null;
  primary_photo_blurhash?: string | null;
  primary_photo_alt?: string | null;
  photo_count?: number;
  /** Task 10: caller-scoped save state, hydrated by GET /api/listings. */
  bookmarked?: boolean;
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
  categories,
  active,
  onActiveChange,
  onViewOnMap,
  as: Root = 'li',
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
  /**
   * Task 10: id → localized name map for the category chip. Optional so
   * narrower call sites (map list, Following feed) degrade silently — no
   * map, or an id the map doesn't know, simply renders no chip.
   */
  categories?: ReadonlyMap<string, string> | undefined;
  /**
   * Task 12 pin↔card linkage (map tab only): `active` highlights the card
   * when its marker is hovered; `onActiveChange` reports card hover/focus so
   * the marker restyles; `onViewOnMap` renders the "View on map" affordance
   * (action.viewOnMap) that pans the map to this listing's pin.
   */
  active?: boolean | undefined;
  onActiveChange?: ((active: boolean) => void) | undefined;
  onViewOnMap?: (() => void) | undefined;
  /**
   * Root element. Default 'li' (directory <ul> grids); pass 'div' when the
   * card renders outside a list or inside a caller-owned <li> (see module doc).
   */
  as?: 'li' | 'div' | undefined;
}) {
  const t = useT();
  const cookiePrefs = useCookieLitePrefs();
  const litePrefs = prefs ?? cookiePrefs;

  // Interpunct, not comma: "city · country" reads as two coordinates, while
  // the comma form looked like one half-finished address (Task 10 fix).
  const location = [listing.city, listing.country].filter(Boolean).join(' · ');
  const thumbUrl = listing.primary_photo_thumb_url ?? listing.primary_photo_url ?? null;
  const categoryName = categories?.get(listing.category_id);
  // First-class contact CTA (§18/§28) — mirrors whatsapp-cta.tsx: the href
  // deep-links the listing's whatsapp contact, but the LABEL stays
  // channel-nameless (11 Jul ruling, docs/front-door-standard.md §5.2).
  const whatsapp = asContactLinks(listing.contact_links).find((row) => row.type === 'whatsapp');
  const contactUrl = whatsapp ? contactHref('whatsapp', whatsapp.value) : null;

  // Hover AND focus report activation (focus bubbles to the li in React), so
  // keyboard users get the same card→pin highlight as mouse users.
  const activation = onActiveChange
    ? {
        onMouseEnter: () => onActiveChange(true),
        onMouseLeave: () => onActiveChange(false),
        onFocus: () => onActiveChange(true),
        onBlur: () => onActiveChange(false),
      }
    : {};

  return (
    <Root
      className={`xidig-card xidig-listing-card${active ? ' xidig-listing-card--active' : ''}`}
      {...activation}
    >
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
            <VerifiedExplainer verifiedAt={listing.verified_at ?? null} />
          ) : null}
          {listing.owner_user_id === null ? (
            <span className="xidig-tag">{t('suuq.unclaimed')}</span>
          ) : null}
          {listing.source ? <ContentSourceBadge source={listing.source} /> : null}
          {categoryName ? <span className="xidig-tag">{categoryName}</span> : null}
          <PriceRangeDisplay level={listing.price_range} />
          {listing.opening_hours !== undefined && listing.opening_hours !== null ? (
            <OpenNowChip hours={listing.opening_hours} />
          ) : null}
        </p>
        {contactUrl || signedIn !== undefined || onViewOnMap ? (
          // Sibling controls in a row, never nested inside another
          // interactive — the title link stays its own element.
          <p className="xidig-listing-card__actions">
            {contactUrl ? (
              <a
                className="xidig-button xidig-button--primary xidig-listing-card__cta"
                href={contactUrl}
                rel="noopener noreferrer"
                target="_blank"
                onClick={() =>
                  trackClient('contact_click', { listing_id: listing.id, channel: 'whatsapp' })
                }
              >
                {t('suuq.whatsappCta')}
              </a>
            ) : null}
            {onViewOnMap ? (
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                onClick={onViewOnMap}
              >
                {t('action.viewOnMap')}
              </button>
            ) : null}
            {signedIn !== undefined ? (
              <BookmarkButton
                entityType="listing"
                entityId={listing.id}
                signedIn={signedIn}
                {...(bookmarked !== undefined ? { initialBookmarked: bookmarked } : {})}
              />
            ) : null}
          </p>
        ) : null}
      </div>
    </Root>
  );
}
