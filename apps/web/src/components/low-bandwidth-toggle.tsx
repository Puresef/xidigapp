'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { apiPatch } from '@/lib/api-client';
import { serializeLowBandwidthCookie } from '@/lib/bandwidth';
import { LITE_BUNDLES, serializeLitePrefsCookie } from '@/lib/lite/prefs';
import { MOTION_COOKIE, serializeAppearanceCookie } from '@/lib/settings/appearance';

/**
 * Low-bandwidth mode toggle (§22 — Phase 1 acceptance; Phase 4.5 Lite). The
 * simple on/off maps to the Lite bundles: on = `essentials` (defer images/
 * embeds/maps/animations, keep tiny avatars), off = `everything`. Both the
 * legacy `xidig_lowbw` cookie and the granular `xidig_lite` cookie flip
 * (rendering source of truth, works signed-out); the server column write is
 * best-effort for cross-device continuity; router.refresh() re-renders
 * server pages so heavy media collapses to placeholders on the very next
 * paint. The granular per-category UI lives in Settings → Data & Lite mode.
 * Fires §23 `low_bandwidth_enabled`.
 */
export function LowBandwidthToggle({
  initialEnabled,
  signedIn,
}: {
  initialEnabled: boolean;
  signedIn: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    const bundle = next ? LITE_BUNDLES.essentials : LITE_BUNDLES.everything;
    document.cookie = serializeLowBandwidthCookie(next);
    document.cookie = serializeLitePrefsCookie(bundle);
    // Drive the data-motion kill-switch from the bundle's animations pref —
    // essentials defers animations (→ 'off'), everything loads them (→ system).
    document.cookie = serializeAppearanceCookie(MOTION_COOKIE, bundle.animations ? 'system' : 'off');
    trackClient('low_bandwidth_enabled', { enabled: next });
    if (signedIn) {
      // Best-effort — the cookie already took effect; a failed column write
      // only loses cross-device continuity.
      void apiPatch('/api/me/bandwidth', { enabled: next }).catch(() => undefined);
    }
    router.refresh();
  }

  return (
    <div className="xidig-field">
      <span className="xidig-field__label">{t('settings.bandwidthTitle')}</span>
      <p className="xidig-field__hint">{t('settings.bandwidthBody')}</p>
      <button
        type="button"
        className="xidig-button xidig-button--secondary xidig-switch"
        aria-pressed={enabled}
        onClick={toggle}
      >
        {enabled ? t('settings.toggleOn') : t('settings.toggleOff')}
      </button>
    </div>
  );
}
