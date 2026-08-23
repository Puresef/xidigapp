'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { MediaSlot } from '@/components/media/media-slot';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import { trackClient } from '@/lib/analytics/client';
import type { PlainError } from '@/lib/errors';
import { listingOpenNow } from '@/lib/listings';
import { MAP_EST_BYTES } from '@/lib/lite/estimates';
import type { LitePrefs } from '@/lib/lite/prefs';
import {
  loadStoredBbox,
  shouldPersistBbox,
  storeBbox,
  type BboxChangeReason,
} from '@/lib/suuq/map-viewport';
import { PlainErrorBanner } from '../auth/plain-error';
import { ListingCard, type ListingRow } from './listing-card';
import type { MapMarker } from './listings-map';

/**
 * Map browse surface (§18), embedded in the directory's map tab (Task 12:
 * /suuq?tab=map — BusinessDirectory owns the filter bar and passes the
 * APPLIED filter set down as a string; this component owns the viewport).
 *
 * - The same cards render underneath the map (the map is a lens, the list
 *   stays the accessible truth). Panning arms an explicit "search this area"
 *   button — no fetch per drag (§22).
 * - Filters flow into every fetch; the current bbox (restored from
 *   localStorage on boot — Task 12 viewport persistence) scopes them.
 * - Lite (§22 defer-not-disable): when maps are deferred the LIST still
 *   fetches and renders (rows are cheap JSON); only the Leaflet mount + tiles
 *   sit behind the MediaSlot "Show map" reveal, in the identical layout slot.
 * - Pin↔card linkage: hover either side highlights the other (activeId);
 *   marker tap opens a floating preview panel reusing the real ListingCard —
 *   richer AND more accessible than Leaflet's div-soup popup (focusable
 *   panel, Escape closes, real links/buttons).
 * - Fires §23 `map_view` once per mount.
 */

const ListingsMap = dynamic(() => import('./listings-map'), { ssr: false });

interface ListingPage {
  listings: ListingRow[];
  nextCursor: string | null;
}

/** MediaSlot identity for the browse map tiles (kept from the old /suuq/map
 *  page so earlier same-session reveals stay honoured). */
const MAP_TILES_SRC = '/suuq/map#tiles';

export function MapBrowser({
  filters = '',
  openNowOnly = false,
  categories,
  prefs,
}: {
  /** APPLIED directory filter set (URLSearchParams string) — Task 10 state. */
  filters?: string | undefined;
  /** Client-side "open now" toggle — filters cards AND pins over loaded rows. */
  openNowOnly?: boolean | undefined;
  /** id → localized name for the card category chips. */
  categories?: ReadonlyMap<string, string> | undefined;
  prefs: LitePrefs;
}) {
  const t = useT();
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [bboxDirty, setBboxDirty] = useState(false);
  /** Pin↔card hover linkage. */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Marker-tap preview panel. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** Card→map "View on map" request (n bumps so repeat taps recentre). */
  const [focusMarker, setFocusMarker] = useState<{
    id: string;
    latitude: number;
    longitude: number;
    n: number;
  } | null>(null);

  /** Latest viewport (map moveend, or the restored bbox before the map
   *  mounts) — every fetch is scoped to it. */
  const bboxRef = useRef<string | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);
  /** Newest requested fetch; stale responses are dropped (filters can change
   *  while a search-this-area request is in flight). */
  const genRef = useRef(0);
  const previewPanelRef = useRef<HTMLElement | null>(null);
  /** Focus restore for the preview panel: the element focused when the
   *  preview opened (marker / "View on map" button), so Escape/× returns the
   *  keyboard user where they were instead of dropping focus to <body>. */
  const previewReturnRef = useRef<HTMLElement | null>(null);
  const previewOpenRef = useRef(false);
  const mapWrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (area: string | null, filterSet: string) => {
    const gen = ++genRef.current;
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams(filterSet);
      params.set('limit', '50');
      if (area) params.set('bbox', area);
      const page = await apiGet<ListingPage>(`/api/listings?${params.toString()}`);
      if (genRef.current !== gen) return;
      setRows(page.listings);
      setLoaded(true);
      setBboxDirty(false);
    } catch (cause) {
      if (genRef.current !== gen) return;
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      if (genRef.current === gen) setPending(false);
    }
  }, []);

  // Boot + filter changes. Boot restores the persisted bbox FIRST so the
  // initial fetch matches the restored viewport (Task 12 — the old browser
  // fetched global-newest and ignored where you were). A filter change
  // refetches the current viewport under the new set.
  const lastFiltersRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFiltersRef.current === filters) return;
    const first = lastFiltersRef.current === null;
    lastFiltersRef.current = filters;
    if (first) {
      trackClient('map_view', {});
      const stored = loadStoredBbox();
      if (stored) {
        bboxRef.current = stored;
        setBbox(stored);
      }
    }
    void load(bboxRef.current, filters);
  }, [filters, load]);

  const handleBboxChange = useCallback((nextBbox: string, reason: BboxChangeReason) => {
    bboxRef.current = nextBbox;
    setBbox(nextBbox);
    // Persist real viewports (user/fit/restore); NEVER the Mogadishu
    // 'default' — storing it on an empty first visit would make the stored
    // bbox win every later mount and permanently kill fit-to-pins.
    if (shouldPersistBbox(reason)) storeBbox(nextBbox);
    // Only real pans arm "search this area".
    if (reason === 'user') setBboxDirty(true);
  }, []);

  // "Open now" applies to pins AND cards — the map must never show a pin the
  // list below denies (client-side over loaded rows, same v1 caveat as the
  // directory list).
  const visibleRows = useMemo(
    () => (openNowOnly ? rows.filter((row) => listingOpenNow(row.opening_hours)) : rows),
    [rows, openNowOnly],
  );

  // Stable identity keyed on the data — otherwise a moveend→setState re-render
  // rebuilds a new array each time, and the map's marker-sync effect clears
  // and re-adds every marker mid-interaction.
  const markers: MapMarker[] = useMemo(
    () =>
      visibleRows
        .filter((row) => row.latitude !== null && row.longitude !== null)
        .map((row) => ({
          id: row.id,
          name: row.business_name,
          latitude: row.latitude as number,
          longitude: row.longitude as number,
        })),
    [visibleRows],
  );

  const preview = previewId ? (rows.find((row) => row.id === previewId) ?? null) : null;

  // Move focus into the panel when it opens — keyboard flow: marker Enter →
  // panel → its links/buttons; Escape (or Close) returns focus to whatever
  // opened it (captured on the closed→open transition), falling back to the
  // map container when that trigger is gone (markers rebuild on re-cluster).
  useEffect(() => {
    if (preview) {
      if (!previewOpenRef.current) {
        previewOpenRef.current = true;
        previewReturnRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      previewPanelRef.current?.focus();
    } else if (previewOpenRef.current) {
      previewOpenRef.current = false;
      const target = previewReturnRef.current;
      previewReturnRef.current = null;
      if (target?.isConnected) target.focus();
      else mapWrapRef.current?.querySelector<HTMLElement>('.xidig-map')?.focus();
    }
  }, [preview]);

  const mapsEnabled = prefs.maps;

  const mapEl = (
    <ListingsMap
      mode="browse"
      markers={markers}
      onBboxChange={handleBboxChange}
      activeId={activeId}
      onActiveChange={setActiveId}
      onMarkerSelect={setPreviewId}
      focusMarker={focusMarker}
    />
  );

  return (
    <div>
      {error ? <PlainErrorBanner error={error} /> : null}
      <div className="xidig-map-wrap" ref={mapWrapRef}>
        {mapsEnabled ? (
          mapEl
        ) : (
          // Lite defers the TILES, not the surface: identical slot, list
          // below still live — Leaflet only mounts on the explicit reveal.
          <MediaSlot
            kind="map"
            src={MAP_TILES_SRC}
            alt={t('lite.mapLabel')}
            estBytes={MAP_EST_BYTES}
            prefs={prefs}
          >
            {mapEl}
          </MediaSlot>
        )}
        {preview ? (
          <section
            className="xidig-map-preview"
            aria-label={preview.business_name}
            tabIndex={-1}
            ref={previewPanelRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setPreviewId(null);
            }}
          >
            <p className="xidig-map-preview__bar">
              <button
                type="button"
                className="xidig-icon-button"
                aria-label={t('action.close')}
                onClick={() => setPreviewId(null)}
              >
                ×
              </button>
            </p>
            {/* A single previewed card is not a list — div wrapper (the grid
                class is purely layout) + as="div" root keeps the DOM valid. */}
            <div className="xidig-card-grid">
              <ListingCard
                as="div"
                listing={preview}
                signedIn
                bookmarked={preview.bookmarked ?? false}
                categories={categories}
              />
            </div>
          </section>
        ) : null}
      </div>
      <p>
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending || !bboxDirty || !bbox}
          onClick={() => void load(bboxRef.current, filters)}
        >
          {t('suuq.searchArea')}
        </button>
      </p>
      {pending ? (
        <p className="xidig-card__meta" role="status">
          <AnimatedMark mode="loading" size={20} className="xidig-flap-inline" />
          {t('state.loading')}
        </p>
      ) : null}
      {!pending && loaded && visibleRows.length === 0 && !error ? (
        <p className="xidig-card__meta">{t('suuq.noResults')}</p>
      ) : null}
      <ul className="xidig-card-grid">
        {visibleRows.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            signedIn
            bookmarked={listing.bookmarked ?? false}
            categories={categories}
            active={activeId === listing.id}
            onActiveChange={(next) =>
              setActiveId((current) =>
                next ? listing.id : current === listing.id ? null : current,
              )
            }
            onViewOnMap={
              // action.viewOnMap (card→map): pan/zoom to the pin + open its
              // preview. Only when the map is actually visible — panning a
              // deferred MediaSlot placeholder would do nothing.
              mapsEnabled && listing.latitude !== null && listing.longitude !== null
                ? () => {
                    setFocusMarker((current) => ({
                      id: listing.id,
                      latitude: listing.latitude as number,
                      longitude: listing.longitude as number,
                      n: (current?.n ?? 0) + 1,
                    }));
                    setPreviewId(listing.id);
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}
