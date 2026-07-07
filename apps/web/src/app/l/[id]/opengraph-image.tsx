import { ImageResponse } from 'next/og';
import { z } from 'zod';

import { getPublicListingView } from '@/lib/listing-view';
import { formatPriceRange } from '@/lib/listings';
import { publicMediaUrl } from '@/lib/media/storage';

export const dynamic = 'force-dynamic';

/**
 * Listing OG card (Phase 4.5, spec §4 LISTING) — what a shared /l/[id] link
 * shows in WhatsApp previews (§28, the primary growth loop). Primary photo as
 * the background when the listing has one, else a brand card with the
 * business name + category + city. Public data only (getPublicListingView is
 * published-listings-only), and rendered per-request — no viewer state.
 *
 * Colors are literal hex mirrors of the globals.css tokens (--x-fg #16181d
 * etc.) — Satori has no CSS-variable support.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Xidig';

const idSchema = z.string().uuid();

const INK = '#16181d';
const PAPER = '#ffffff';
const MUTED = '#c9ced6';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = idSchema.safeParse(id).success ? await getPublicListingView(id) : null;

  if (!view) {
    // Unknown/unpublished listing: a plain brand card (no 404 — link
    // previews should never break the page share itself).
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: INK,
            color: PAPER,
            fontSize: 96,
            fontWeight: 700,
          }}
        >
          {/* eslint-disable-next-line xidig-i18n/no-hardcoded-copy -- brand wordmark, not UI copy */}
          <span>✦ Xidig</span>
        </div>
      ),
      size,
    );
  }

  const { listing, categoryName } = view;
  const metaLine = [
    categoryName?.en ?? null,
    listing.city,
    listing.price_range ? formatPriceRange(listing.price_range) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const photoUrl = listing.primary_photo_path
    ? publicMediaUrl(listing.primary_photo_path)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          backgroundColor: INK,
        }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={listing.primary_photo_alt ?? listing.business_name}
            width={size.width}
            height={size.height}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : null}
        {/* Legibility scrim over the photo; plain brand ink otherwise. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background: photoUrl
              ? 'linear-gradient(to top, rgba(22,24,29,0.92) 0%, rgba(22,24,29,0.25) 55%, rgba(22,24,29,0.05) 100%)'
              : 'transparent',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 64,
            right: 64,
            bottom: 56,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            color: PAPER,
          }}
        >
          <div style={{ display: 'flex', fontSize: 30, color: MUTED }}>
            {/* eslint-disable-next-line xidig-i18n/no-hardcoded-copy -- brand wordmark, not UI copy */}
            <span>✦ Xidig</span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: listing.business_name.length > 32 ? 56 : 72,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {listing.business_name}
          </div>
          {metaLine ? (
            <div style={{ display: 'flex', fontSize: 34, color: MUTED }}>{metaLine}</div>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
