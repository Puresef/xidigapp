'use client';

import { apiPatch } from '@/lib/api-client';
import { serializeLowBandwidthCookie } from '@/lib/bandwidth';
import { LITE_BUNDLES, serializeLitePrefsCookie, type LiteBundleName } from '@/lib/lite/prefs';
import { MOTION_COOKIE, serializeAppearanceCookie } from '@/lib/settings/appearance';

/**
 * Apply a Lite bundle (§22) — the ONE write sequence shared by the Settings
 * toggle and the auto-prompt so the two never drift. Flips all three cookies
 * (the rendering source of truth, works signed-out) and best-effort mirrors the
 * on/off state to the server column for cross-device continuity. The caller
 * still does its own trackClient(...) + router.refresh() (those need the
 * component's router / analytics context).
 */
export function applyLiteBundle(name: LiteBundleName, signedIn: boolean): void {
  const bundle = LITE_BUNDLES[name];
  const enabled = name !== 'everything';
  document.cookie = serializeLowBandwidthCookie(enabled);
  document.cookie = serializeLitePrefsCookie(bundle);
  // Drive the data-motion kill-switch from the bundle's animations pref.
  document.cookie = serializeAppearanceCookie(MOTION_COOKIE, bundle.animations ? 'system' : 'off');
  if (signedIn) {
    void apiPatch('/api/me/bandwidth', { enabled }).catch(() => undefined);
  }
}
