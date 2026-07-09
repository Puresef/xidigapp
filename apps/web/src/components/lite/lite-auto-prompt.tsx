'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { applyLiteBundle } from '@/lib/lite/apply';
import { isSlowConnection, onConnectionChange } from '@/lib/lite/connection';

/**
 * Low-bandwidth auto-prompt (§22): when a 2G/3G/Save-Data connection is detected
 * — or the visitor is in a low-bandwidth region and the Network Information API
 * is unavailable — offer to switch to Lite. Respects dismissal (a 1-year device
 * cookie), never nags when Lite is already active, and re-checks on connection
 * change. Accept = the shared `essentials` bundle write. Copy is all t()-keyed.
 */

const DISMISS_COOKIE = 'xidig_lite_prompt';
const ONE_YEAR = 60 * 60 * 24 * 365;

function isDismissed(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie.split('; ').some((c) => c.startsWith(`${DISMISS_COOKIE}=`));
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  try {
    document.cookie = `${DISMISS_COOKIE}=1; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax`;
  } catch {
    // Storage disabled — the in-memory state still hides it for the session.
  }
}

export function LiteAutoPrompt({
  signedIn,
  liteActive,
  regionSuggestsLite,
}: {
  signedIn: boolean;
  liteActive: boolean;
  regionSuggestsLite: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    // Never prompt when Lite is already on or the member dismissed it.
    if (liteActive || isDismissed()) return;

    const evaluate = () => {
      if (fired.current) return;
      const slow = isSlowConnection();
      if (!slow && !regionSuggestsLite) return;
      fired.current = true;
      setShow(true);
      trackClient('low_bandwidth_prompt_shown', { reason: slow ? 'connection' : 'region' });
    };

    evaluate();
    return onConnectionChange(evaluate);
  }, [liteActive, regionSuggestsLite]);

  if (!show) return null;

  function accept(): void {
    applyLiteBundle('essentials', signedIn);
    trackClient('low_bandwidth_enabled', { enabled: true });
    persistDismissed(); // enabling counts as answered — don't re-offer
    setShow(false);
    router.refresh();
  }

  function dismiss(): void {
    persistDismissed();
    setShow(false);
    trackClient('low_bandwidth_prompt_dismissed', {});
  }

  return (
    <div className="xidig-lite-prompt" role="dialog" aria-live="polite" aria-label={t('lite.promptTitle')}>
      <p className="xidig-lite-prompt__title">{t('lite.promptTitle')}</p>
      <p className="xidig-lite-prompt__body">{t('lite.promptBody')}</p>
      <div className="xidig-lite-prompt__actions">
        <button type="button" className="xidig-button xidig-button--primary" onClick={accept}>
          {t('lite.promptAccept')}
        </button>
        <button type="button" className="xidig-button" onClick={dismiss}>
          {t('lite.promptDismiss')}
        </button>
      </div>
    </div>
  );
}
