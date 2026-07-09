'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { applyLiteBundle } from '@/lib/lite/apply';

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
    // Shared write sequence (cookies + best-effort server mirror) — on =
    // `essentials`, off = `everything`; identical to the auto-prompt's Accept.
    applyLiteBundle(next ? 'essentials' : 'everything', signedIn);
    trackClient('low_bandwidth_enabled', { enabled: next });
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
