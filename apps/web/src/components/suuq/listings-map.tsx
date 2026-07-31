'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useCallback, useEffect, useRef } from 'react';

import { useT } from '@xidig/i18n/react';

import { clusterPoints } from '@/lib/suuq/map-cluster';
import {
  loadStoredBbox,
  parseBbox,
  type BboxChangeReason,
} from '@/lib/suuq/map-viewport';

/**
 * Leaflet wrapper (§18 map; §24 lists MapLibre for later — Leaflet + OSM
 * raster ships Phase 1: ~42KB, no API key, and it never loads unless a page
 * explicitly mounts it, which low-bandwidth mode doesn't, §22).
 *
 * Two modes:
 *  - browse: dependency-free grid-clustered markers (lib/suuq/map-cluster —
 *    ≤50 rows per fetch, so no plugin needed) with pin↔card linkage: marker
 *    hover/tap reports up via onActiveChange/onMarkerSelect, and the parent's
 *    activeId restyles the matching pin. Viewport order (Task 12): stored
 *    last-viewed bbox → fitBounds to the first fetched pins → Mogadishu
 *    constant. moveend reports the bbox up tagged with a BboxChangeReason
 *    ('user' | 'fit' | 'restore' | 'default') so only real pans arm "search
 *    this area" and only the hardcoded default escapes persistence.
 *  - pick: §18 pin-drop. Click/tap drops the pin; the parent receives lat/lng
 *    exactly as POST /api/listings expects.
 *
 * Always dynamic-imported with ssr:false (Leaflet touches window at import).
 * All movement is animate:false — deterministic, and no new animation to
 * gate behind the motion doctrine.
 */

export interface MapMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

// Mogadishu — the FINAL fallback viewport for an empty map (§18 Somalia
// addressing first): stored bbox and fit-to-pins both come first (Task 12).
const DEFAULT_CENTER: [number, number] = [2.0469, 45.3182];
const DEFAULT_ZOOM = 12;
/** fitBounds ceiling — a lone pin must not slam to street-level zoom 19. */
const FIT_MAX_ZOOM = 15;

function pinIcon(active: boolean): L.DivIcon {
  return L.divIcon({
    className: `xidig-map-pin${active ? ' xidig-map-pin--active' : ''}`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function clusterIcon(count: number): L.DivIcon {
  const size = count >= 100 ? 40 : count >= 10 ? 34 : 28;
  return L.divIcon({
    className: 'xidig-map-cluster',
    // Count is a number — no user content enters this HTML string.
    html: `<span aria-hidden="true">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function ListingsMap(props: {
  mode: 'browse' | 'pick';
  markers?: MapMarker[];
  /**
   * Reports the viewport on every moveend, tagged with WHY it moved
   * (BboxChangeReason) so the parent can decide per reason: only 'user' arms
   * "search this area", and only the hardcoded 'default' skips persistence.
   */
  onBboxChange?: (bbox: string, reason: BboxChangeReason) => void;
  /** Pin↔card linkage (Task 12): hovered/focused listing, both directions. */
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  /** Marker tap → the parent opens its preview panel. */
  onMarkerSelect?: (id: string) => void;
  /** Card→map affordance: bump `n` to pan/zoom to a listing. */
  focusMarker?: { id: string; latitude: number; longitude: number; n: number } | null;
  initialPick?: { latitude: number; longitude: number } | null;
  onPick?: (latitude: number, longitude: number) => void;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);
  /** Latest browse data + one L.Marker per un-clustered listing id. */
  const markersDataRef = useRef<MapMarker[]>([]);
  const markerElsRef = useRef(new Map<string, L.Marker>());
  /** Set while WE move the map (fit-to-pins/cluster-zoom/card-focus) — the
   *  moveend handler reports that reason instead of 'user'. */
  const programmaticRef = useRef<Exclude<BboxChangeReason, 'user'> | null>(null);
  /** Arm fit-to-pins only when no stored viewport AND the user hasn't moved. */
  const autoFitPendingRef = useRef(false);

  // Latest callbacks/values without re-initialising the map.
  const onBboxChangeRef = useRef(props.onBboxChange);
  onBboxChangeRef.current = props.onBboxChange;
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;
  const onActiveChangeRef = useRef(props.onActiveChange);
  onActiveChangeRef.current = props.onActiveChange;
  const onMarkerSelectRef = useRef(props.onMarkerSelect);
  onMarkerSelectRef.current = props.onMarkerSelect;
  const activeIdRef = useRef(props.activeId ?? null);
  const tRef = useRef(t);
  tRef.current = t;

  const { mode } = props;
  // First-mount snapshot: a fresh object identity per render must never
  // re-initialise the map.
  const initialPickRef = useRef(props.initialPick ?? null);

  /** Run a programmatic map move without arming "search this area"
   *  (animate:false keeps the moveend synchronous, so the flag scopes).
   *  Every caller is a fit-to-real-data move, so the reason is 'fit'. */
  const moveProgrammatic = useCallback((run: () => void) => {
    programmaticRef.current = 'fit';
    try {
      run();
    } finally {
      programmaticRef.current = null;
    }
  }, []);

  /** (Re)build clustered markers for the current zoom. Stable identity — also
   *  called from the map's zoomend listener. */
  const renderMarkers = useCallback(() => {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group) return;
    group.clearLayers();
    markerElsRef.current.clear();

    for (const cluster of clusterPoints(markersDataRef.current, map.getZoom())) {
      if (cluster.items.length === 1) {
        const item = cluster.items[0]!;
        const marker = L.marker([item.latitude, item.longitude], {
          icon: pinIcon(activeIdRef.current === item.id),
          // Plain-text tooltip + accessible name; Leaflet assigns it as a DOM
          // property, so no HTML escaping concern.
          title: item.name,
          keyboard: true,
        })
          .on('click', () => onMarkerSelectRef.current?.(item.id))
          .on('mouseover', () => onActiveChangeRef.current?.(item.id))
          .on('mouseout', () => onActiveChangeRef.current?.(null))
          .addTo(group);
        markerElsRef.current.set(item.id, marker);
      } else {
        const bounds = L.latLngBounds(
          cluster.items.map((item) => [item.latitude, item.longitude] as [number, number]),
        );
        L.marker([cluster.latitude, cluster.longitude], {
          icon: clusterIcon(cluster.items.length),
          title: tRef.current('suuq.mapCluster', { count: cluster.items.length }),
          keyboard: true,
        })
          .on('click', () => {
            // Zoom toward the members; identical coordinates would otherwise
            // pin getBoundsZoom at its maximum. zoomend re-clusters.
            const zoom = Math.max(
              map.getZoom() + 1,
              Math.min(map.getBoundsZoom(bounds), FIT_MAX_ZOOM + 2),
            );
            moveProgrammatic(() => map.setView(bounds.getCenter(), zoom, { animate: false }));
          })
          .addTo(group);
      }
    }
  }, [moveProgrammatic]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const initialPick = initialPickRef.current;

    const map = L.map(el);
    /** Why the initial (browse) viewport report fires — 'default' must NOT be
     *  persisted by the parent or fit-to-pins dies forever (see map-viewport). */
    let initialReason: Extract<BboxChangeReason, 'restore' | 'default'> = 'default';

    if (mode === 'pick') {
      const start: [number, number] = initialPick
        ? [initialPick.latitude, initialPick.longitude]
        : DEFAULT_CENTER;
      map.setView(start, DEFAULT_ZOOM);
    } else {
      // Task 12 viewport order: stored last-viewed bbox first (set BEFORE the
      // tile layer mounts so no Mogadishu tiles are ever fetched), else the
      // Mogadishu constant with fit-to-pins armed for the first data arrival.
      const stored = parseBbox(loadStoredBbox());
      if (stored) {
        const [west, south, east, north] = stored;
        map.fitBounds(L.latLngBounds([south, west], [north, east]), { animate: false });
        initialReason = 'restore';
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        autoFitPendingRef.current = true;
      }
    }

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      // OSM attribution is a legal requirement, not translatable copy.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (mode === 'browse') {
      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on('moveend', () => {
        const reason: BboxChangeReason = programmaticRef.current ?? 'user';
        if (reason === 'user') autoFitPendingRef.current = false;
        const b = map.getBounds();
        onBboxChangeRef.current?.(
          `${b.getWest().toFixed(6)},${b.getSouth().toFixed(6)},${b.getEast().toFixed(6)},${b.getNorth().toFixed(6)}`,
          reason,
        );
      });
      map.on('zoomend', renderMarkers);
      // Report the restored/initial viewport once so the parent's bbox state
      // matches what's on screen ('restore' persists, 'default' must not).
      const b = map.getBounds();
      onBboxChangeRef.current?.(
        `${b.getWest().toFixed(6)},${b.getSouth().toFixed(6)},${b.getEast().toFixed(6)},${b.getNorth().toFixed(6)}`,
        initialReason,
      );
      renderMarkers();
    } else {
      mapRef.current = map;
      if (initialPick) {
        pickMarkerRef.current = L.marker([initialPick.latitude, initialPick.longitude], {
          icon: pinIcon(false),
        }).addTo(map);
      }
      map.on('click', (event: L.LeafletMouseEvent) => {
        const { lat, lng } = event.latlng;
        if (pickMarkerRef.current) {
          pickMarkerRef.current.setLatLng(event.latlng);
        } else {
          pickMarkerRef.current = L.marker(event.latlng, { icon: pinIcon(false) }).addTo(map);
        }
        onPickRef.current?.(lat, lng);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      pickMarkerRef.current = null;
      markerElsRef.current.clear();
    };
  }, [mode, renderMarkers]);

  // Browse mode: sync markers on data change; fit-to-pins on the FIRST data
  // arrival when no stored viewport exists and the user hasn't panned yet.
  useEffect(() => {
    if (mode !== 'browse') return;
    const map = mapRef.current;
    if (!map || !markersRef.current) return;
    markersDataRef.current = props.markers ?? [];
    renderMarkers();

    if (autoFitPendingRef.current && markersDataRef.current.length > 0) {
      autoFitPendingRef.current = false;
      const bounds = L.latLngBounds(
        markersDataRef.current.map((m) => [m.latitude, m.longitude] as [number, number]),
      );
      moveProgrammatic(() =>
        map.fitBounds(bounds, { animate: false, padding: [24, 24], maxZoom: FIT_MAX_ZOOM }),
      );
    }
  }, [mode, props.markers, renderMarkers, moveProgrammatic]);

  // Pin↔card linkage: restyle the matching pin in place (no rebuild — a
  // rebuild would drop hover state and keyboard focus mid-interaction).
  useEffect(() => {
    activeIdRef.current = props.activeId ?? null;
    for (const [id, marker] of markerElsRef.current) {
      marker.getElement()?.classList.toggle('xidig-map-pin--active', id === props.activeId);
    }
  }, [props.activeId]);

  // Card→map: "View on map" pans/zooms to the listing (n bumps per request so
  // repeated taps on the same card still recentre).
  const focusMarker = props.focusMarker ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'browse' || !focusMarker) return;
    moveProgrammatic(() =>
      map.setView(
        [focusMarker.latitude, focusMarker.longitude],
        Math.max(map.getZoom(), FIT_MAX_ZOOM),
        { animate: false },
      ),
    );
    // markers re-cluster via zoomend; the target pin un-clusters at this zoom
    // in the common case and picks up its active restyle from activeId.
  }, [mode, focusMarker, moveProgrammatic]);

  return (
    <div
      ref={containerRef}
      className={`xidig-map${mode === 'pick' ? ' xidig-map--pick' : ''}`}
      role="application"
      aria-label={t('a11y.map')}
    />
  );
}

export default ListingsMap;
