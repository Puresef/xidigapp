'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { useT } from '@xidig/i18n/react';

/**
 * Leaflet wrapper (§18 map; §24 lists MapLibre for later — Leaflet + OSM
 * raster ships Phase 1: ~42KB, no API key, and it never loads unless a page
 * explicitly mounts it, which low-bandwidth mode doesn't, §22).
 *
 * Two modes:
 *  - browse: markers with permalink popups + a moveend callback so the parent
 *    can offer "search this area" (bbox matches GET /api/listings).
 *  - pick: §18 pin-drop. Click/tap drops the pin; the parent receives lat/lng
 *    exactly as POST /api/listings expects.
 *
 * Always dynamic-imported with ssr:false (Leaflet touches window at import).
 */

export interface MapMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

// Mogadishu — the sensible default viewport for an empty map (§18 Somalia
// addressing first).
const DEFAULT_CENTER: [number, number] = [2.0469, 45.3182];
const DEFAULT_ZOOM = 12;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pinIcon(): L.DivIcon {
  return L.divIcon({ className: 'xidig-map-pin', iconSize: [14, 14], iconAnchor: [7, 7] });
}

export function ListingsMap(props: {
  mode: 'browse' | 'pick';
  markers?: MapMarker[];
  onBboxChange?: (bbox: string) => void;
  initialPick?: { latitude: number; longitude: number } | null;
  onPick?: (latitude: number, longitude: number) => void;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);

  // Latest callbacks without re-initialising the map.
  const onBboxChangeRef = useRef(props.onBboxChange);
  onBboxChangeRef.current = props.onBboxChange;
  const onPickRef = useRef(props.onPick);
  onPickRef.current = props.onPick;

  const { mode } = props;
  // First-mount snapshot: a fresh object identity per render must never
  // re-initialise the map.
  const initialPickRef = useRef(props.initialPick ?? null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const initialPick = initialPickRef.current;

    const start: [number, number] =
      mode === 'pick' && initialPick
        ? [initialPick.latitude, initialPick.longitude]
        : DEFAULT_CENTER;

    const map = L.map(el).setView(start, DEFAULT_ZOOM);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      // OSM attribution is a legal requirement, not translatable copy.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (mode === 'browse') {
      markersRef.current = L.layerGroup().addTo(map);
      map.on('moveend', () => {
        const b = map.getBounds();
        onBboxChangeRef.current?.(
          `${b.getWest().toFixed(6)},${b.getSouth().toFixed(6)},${b.getEast().toFixed(6)},${b.getNorth().toFixed(6)}`,
        );
      });
    } else {
      if (initialPick) {
        pickMarkerRef.current = L.marker([initialPick.latitude, initialPick.longitude], {
          icon: pinIcon(),
        }).addTo(map);
      }
      map.on('click', (event: L.LeafletMouseEvent) => {
        const { lat, lng } = event.latlng;
        if (pickMarkerRef.current) {
          pickMarkerRef.current.setLatLng(event.latlng);
        } else {
          pickMarkerRef.current = L.marker(event.latlng, { icon: pinIcon() }).addTo(map);
        }
        onPickRef.current?.(lat, lng);
      });
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      pickMarkerRef.current = null;
    };
  }, [mode]);

  // Browse mode: sync markers on data change.
  useEffect(() => {
    if (mode !== 'browse') return;
    const group = markersRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    group.clearLayers();
    for (const marker of props.markers ?? []) {
      L.marker([marker.latitude, marker.longitude], { icon: pinIcon() })
        .bindPopup(`<a href="/l/${escapeHtml(marker.id)}">${escapeHtml(marker.name)}</a>`)
        .addTo(group);
    }
  }, [mode, props.markers]);

  return <div ref={containerRef} className={`xidig-map${mode === 'pick' ? ' xidig-map--pick' : ''}`} role="application" aria-label={t('a11y.map')} />;
}

export default ListingsMap;
