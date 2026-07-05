'use client';

import { useEffect } from 'react';

import { trackClient } from '@/lib/analytics/client';

/** Fires the §23 `listing_view` event once per detail-page mount. */
export function TrackListingView({ listingId }: { listingId: string }) {
  useEffect(() => {
    trackClient('listing_view', { listing_id: listingId });
  }, [listingId]);
  return null;
}
