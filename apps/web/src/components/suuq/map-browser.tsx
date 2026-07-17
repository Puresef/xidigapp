'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import { trackClient } from '@/lib/analytics/client';
import type { PlainError } from '@/lib/errors';
import { PlainErrorBanner } from '../auth/plain-error';
import { ListingCard, type ListingRow } from './listing-card';
import type { MapMarker } from './listings-map';

/**
 * Map browse surface (§18): Leaflet map of published listings + the same
 * cards underneath (the map is a lens, the list stays the accessible truth).
 * Panning arms an explicit "search this area" button — no fetch per drag
 * (§22). Fires §23 `map_view` once per mount.
 */

const ListingsMap = dynamic(() => import('./listings-map'), { ssr: false });

interface ListingPage {
  listings: ListingRow[];
  nextCursor: string | null;
}

export function MapBrowser() {
  const t = useT();
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);
  const [bboxDirty, setBboxDirty] = useState(false);

  const load = useCallback(async (area: string | null) => {
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (area) params.set('bbox', area);
      const page = await apiGet<ListingPage>(`/api/listings?${params.toString()}`);
      setRows(page.listings);
      setBboxDirty(false);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    trackClient('map_view', {});
    void load(null);
  }, [load]);

  // Stable identity keyed on the data — otherwise a moveend→setState re-render
  // rebuilds a new array each time, and the map's marker-sync effect clears
  // and re-adds every marker, slamming shut any popup the user just opened.
  const markers: MapMarker[] = useMemo(
    () =>
      rows
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => ({
          id: row.id,
          name: row.business_name,
          latitude: row.latitude as number,
          longitude: row.longitude as number,
        })),
    [rows],
  );

  return (
    <div>
      {error ? <PlainErrorBanner error={error} /> : null}
      <ListingsMap
        mode="browse"
        markers={markers}
        onBboxChange={(nextBbox) => {
          setBbox(nextBbox);
          setBboxDirty(true);
        }}
      />
      <p>
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending || !bboxDirty || !bbox}
          onClick={() => void load(bbox)}
        >
          {t('suuq.searchArea')}
        </button>
      </p>
      {pending ? (
        <p className="xidig-card__meta" role="status">
          <AnimatedMark mode="flap" size={20} className="xidig-flap-inline" />
          {t('state.loading')}
        </p>
      ) : null}
      {!pending && rows.length === 0 && !error ? (
        <p className="xidig-card__meta">{t('suuq.noResults')}</p>
      ) : null}
      <ul className="xidig-card-grid">
        {rows.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </ul>
    </div>
  );
}
