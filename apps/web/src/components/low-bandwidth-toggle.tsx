'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { apiPatch } from '@/lib/api-client';
import { serializeLowBandwidthCookie } from '@/lib/bandwidth';

/**
 * Low-bandwidth mode toggle (§22 — Phase 1 acceptance). The cookie flips
 * immediately (rendering source of truth, works signed-out); the server
 * column write is best-effort for cross-device continuity; router.refresh()
 * re-renders server pages so map tiles/images drop on the very next paint.
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
    document.cookie = serializeLowBandwidthCookie(next);
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
