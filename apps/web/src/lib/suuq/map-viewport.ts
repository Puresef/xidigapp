/**
 * Suuq map viewport persistence (Task 12, §18/§22): the browse map remembers
 * the last-viewed bounding box in localStorage so a returning member lands on
 * THEIR area, not a hardcoded default. Restore order (map-browser/listings-map):
 * stored bbox → fitBounds to fetched pins → Mogadishu constant, and the
 * initial /api/listings fetch carries the restored bbox so the first page of
 * rows matches the restored viewport.
 *
 * The stored value is the same `west,south,east,north` string the map emits
 * on moveend and GET /api/listings accepts as `bbox` — one format everywhere.
 * All storage access is try/catch'd (private mode / disabled storage) and
 * injectable for node-env tests.
 */

export const MAP_BBOX_STORAGE_KEY = 'xidig:suuq-map-bbox';

/** `[west, south, east, north]` in degrees. */
export type Bbox = [number, number, number, number];

/**
 * Why a viewport was reported (listings-map → map-browser):
 *  - 'user'    — a real pan/zoom (persist AND arm "search this area")
 *  - 'fit'     — programmatic fit/pan to real data (fit-to-pins, cluster
 *                zoom, card→map focus)
 *  - 'restore' — the stored bbox re-applied on mount
 *  - 'default' — the Mogadishu fallback on an empty first visit
 */
export type BboxChangeReason = 'user' | 'fit' | 'restore' | 'default';

/**
 * Persist every reported viewport EXCEPT the hardcoded default: fit/restore
 * results are real data, but storing the Mogadishu constant on an empty first
 * visit would make loadStoredBbox() succeed forever after — permanently
 * defeating fit-to-pins for members whose listings are elsewhere.
 */
export function shouldPersistBbox(reason: BboxChangeReason): boolean {
  return reason !== 'default';
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Tolerant parse: garbage (wrong arity, NaN, out-of-range latitudes, inverted
 * boxes) returns null so a corrupted stored value silently falls through to
 * the fitBounds/Mogadishu fallbacks. Longitudes are allowed past ±180 (up to
 * ±540) because Leaflet reports world-wrapped pans that way.
 */
export function parseBbox(raw: string | null | undefined): Bbox | null {
  if (!raw) return null;
  const parts = raw.split(',').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [west, south, east, north] = parts as Bbox;
  if (south < -90 || north > 90 || south >= north) return null;
  if (west >= east || Math.abs(west) > 540 || Math.abs(east) > 540) return null;
  return [west, south, east, north];
}

/** Format the wire/storage string the map + API share. */
export function formatBbox([west, south, east, north]: Bbox): string {
  return `${west.toFixed(6)},${south.toFixed(6)},${east.toFixed(6)},${north.toFixed(6)}`;
}

/** The stored last-viewed bbox string, or null when absent/invalid/blocked. */
export function loadStoredBbox(storage: StorageLike | null = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(MAP_BBOX_STORAGE_KEY);
    return raw !== null && parseBbox(raw) !== null ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the last-viewed bbox; invalid strings and storage failures no-op. */
export function storeBbox(bbox: string, storage: StorageLike | null = defaultStorage()): void {
  if (!storage || parseBbox(bbox) === null) return;
  try {
    storage.setItem(MAP_BBOX_STORAGE_KEY, bbox);
  } catch {
    // Quota/private-mode failures are fine — the map just starts at the
    // fallback next visit.
  }
}
