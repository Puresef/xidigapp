/**
 * Network Information API helpers (§22) — the single source of truth for "is
 * this a slow connection", shared by MediaSlot (thumb-first image loads) and the
 * Lite auto-prompt. Everything fails soft: an unsupported browser reports "not
 * slow" rather than throwing.
 */

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** True when the browser reports Save-Data or a 2G/3G effective connection. */
export function isSlowConnection(): boolean {
  const c = connection();
  if (!c) return false;
  if (c.saveData) return true;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
}

/**
 * Subscribe to connection-quality changes (e.g. WiFi → cellular). Returns an
 * unsubscribe fn; a no-op unsubscribe when the API is unavailable.
 */
export function onConnectionChange(listener: () => void): () => void {
  const c = connection();
  if (!c?.addEventListener) return () => undefined;
  c.addEventListener('change', listener);
  return () => c.removeEventListener?.('change', listener);
}

/**
 * Region heuristic for offering Lite when the Network Information API is absent
 * (it is unimplemented on iOS Safari + Firefox). A curated set of markets where
 * mobile data is the norm and expensive/slow — Somalia first (§17/§22 core
 * audience) plus regional neighbours. Lowercase ISO-3166-1 alpha-2, matching
 * getGeoCountry()'s output. Deliberately conservative: a false positive just
 * offers a dismissible prompt, never forces anything.
 */
const LOW_BANDWIDTH_REGIONS = new Set([
  'so', // Somalia
  'et', // Ethiopia
  'ke', // Kenya
  'dj', // Djibouti
  'er', // Eritrea
  'ss', // South Sudan
  'sd', // Sudan
  'ye', // Yemen
]);

export function regionSuggestsLite(country: string | null | undefined): boolean {
  return country != null && LOW_BANDWIDTH_REGIONS.has(country.toLowerCase());
}
