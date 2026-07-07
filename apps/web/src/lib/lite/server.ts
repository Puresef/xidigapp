import { cookies } from 'next/headers';

import { LOW_BANDWIDTH_COOKIE, parseLowBandwidthCookieValue } from '@/lib/bandwidth';

import { LITE_BUNDLES, LITE_COOKIE, parseLitePrefs, type LitePrefs } from './prefs';

/**
 * Server-side read of the Lite mode preference (§22, Phase 4.5). Separate
 * module so client components can import lib/lite/prefs.ts without pulling
 * in next/headers — same split as lib/bandwidth-server.ts, which now derives
 * its boolean from this. Reading cookies() opts the page into dynamic
 * rendering; every page that branches on this is already force-dynamic.
 *
 * Resolution order:
 *   1. `xidig_lite` (JSON LitePrefs — granular Settings UI + bundle shortcuts)
 *   2. legacy `xidig_lowbw=1` → the `essentials` bundle (back-compat: members
 *      who enabled the Phase 1 toggle keep their Lite experience unchanged)
 *   3. neither → `everything` (load normally)
 */
export async function getLitePrefs(): Promise<LitePrefs> {
  const store = await cookies();

  const parsed = parseLitePrefs(store.get(LITE_COOKIE)?.value);
  if (parsed) return parsed;

  if (parseLowBandwidthCookieValue(store.get(LOW_BANDWIDTH_COOKIE)?.value)) {
    return LITE_BUNDLES.essentials;
  }

  return LITE_BUNDLES.everything;
}
