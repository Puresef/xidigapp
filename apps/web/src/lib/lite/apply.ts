'use client';

import { trackClient } from '@/lib/analytics/client';
import { apiPatch } from '@/lib/api-client';
import { serializeLowBandwidthCookie } from '@/lib/bandwidth';
import {
  isLiteActive,
  LITE_BUNDLES,
  matchLiteBundle,
  serializeLitePrefsCookie,
  type LiteBundleName,
  type LitePrefs,
} from '@/lib/lite/prefs';
import { MOTION_COOKIE, serializeAppearanceCookie } from '@/lib/settings/appearance';

/**
 * Apply Lite prefs (§22) — the ONE write sequence shared by every Lite entry
 * point: Settings → Data & Lite mode (granular), the legacy header toggle,
 * the connection auto-prompt, and the consent banner's Lite shortcut
 * (Task 6, 31 Jul — this call used to be duplicated in data-settings.tsx and
 * had drifted: the bundle path never mirrored `preferences.lite`, leaving
 * cross-device continuity stale for toggle/auto-prompt writes).
 *
 * Order matters: all three cookies flip SYNCHRONOUSLY before any network —
 * the xidig_lite cookie is the rendering source of truth (works signed-out,
 * decides before any bytes move), so a refresh/reload right after this call
 * always renders the new prefs even when the mirrors fail. Fires the §23
 * `low_bandwidth_enabled` event exactly once — callers must not re-fire it.
 *
 * The returned promise settles when the best-effort server mirrors finish
 * (it never rejects). `router.refresh()` callers can fire-and-forget;
 * callers that follow with a full `location.reload()` must await it so the
 * navigation doesn't cancel the in-flight PATCHes.
 */
export function applyLitePrefs(next: LitePrefs, signedIn = true): Promise<void> {
  document.cookie = serializeLitePrefsCookie(next);
  // The animations pref is the ONLY thing that drives the data-motion CSS
  // kill-switch (globals.css html[data-motion="off"]) — Lite state alone
  // never suppressed animations before Phase 4.5. animations:false → 'off'.
  document.cookie = serializeAppearanceCookie(MOTION_COOKIE, next.animations ? 'system' : 'off');
  // Legacy cookie + column stay in sync so pre-4.5 call sites keep working.
  const active = isLiteActive(next);
  document.cookie = serializeLowBandwidthCookie(active);
  trackClient('low_bandwidth_enabled', { enabled: active });
  if (!signedIn) return Promise.resolve();
  return Promise.all([
    apiPatch('/api/me/bandwidth', { enabled: active }).catch(() => undefined),
    apiPatch('/api/me/settings', {
      preferences: { lite: next, liteBundle: matchLiteBundle(next) },
    }).catch(() => undefined),
  ]).then(() => undefined);
}

/** Bundle-shortcut form (toggle on/off, auto-prompt Accept, consent banner). */
export function applyLiteBundle(name: LiteBundleName, signedIn: boolean): Promise<void> {
  return applyLitePrefs({ ...LITE_BUNDLES[name] }, signedIn);
}
