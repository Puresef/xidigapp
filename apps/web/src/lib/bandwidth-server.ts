import { getLitePrefs } from '@/lib/lite/server';
import { isLiteActive } from '@/lib/lite/prefs';

/**
 * Server-side read of the low-bandwidth preference (§22). LEGACY SHIM as of
 * Phase 4.5: the granular model lives in lib/lite (getLitePrefs — per-category
 * images/embeds/maps/animations/smallAvatars). This boolean stays for existing
 * call sites and means "any Lite category is deferred". New surfaces should
 * read getLitePrefs() and defer per category through MediaSlot instead of
 * hiding features (docs/lite-mode.md: defer, don't disable).
 *
 * Back-compat contract preserved: a legacy `xidig_lowbw=1` cookie (no
 * `xidig_lite`) maps to the `essentials` bundle, so this still returns true
 * exactly where it used to. Reading cookies() opts the page into dynamic
 * rendering — every page that branches on this is already force-dynamic.
 */
export async function getLowBandwidth(): Promise<boolean> {
  return isLiteActive(await getLitePrefs());
}
