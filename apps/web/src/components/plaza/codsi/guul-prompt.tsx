'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { XidigIcon } from '@/components/icons/XidigIcon';

/**
 * "Guul ka dhig?" (frame 3a): the asker-only nudge to write the win up for
 * the Plaza. Dismissible and NEVER auto-posted — "Adigaa qora" (you write
 * it). Dismissal is remembered per ask on this device; the CTA opens the
 * composer expanded (?compose=1), the member picks Guul themselves.
 */
export function GuulPrompt({ postId }: { postId: string }) {
  const t = useT();
  const storageKey = `xidig:guul-prompt:${postId}`;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === '1') setDismissed(true);
    } catch {
      // Private mode etc. — the prompt just stays dismissible per render.
    }
  }, [storageKey]);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Best-effort persistence only.
    }
  }

  return (
    <div className="xidig-card xidig-codsi-guul-prompt">
      <div className="xidig-codsi-guul-prompt__head">
        <span className="xidig-codsi-strip__text">
          <strong className="xidig-codsi-guul-prompt__title">{t('plaza.guulPromptTitle')}</strong>
          <span className="xidig-codsi-guul-prompt__body">{t('plaza.guulPromptBody')}</span>
        </span>
        <button
          type="button"
          className="xidig-icon-button"
          aria-label={t('plaza.guulPromptClose')}
          onClick={dismiss}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="xidig-codsi-guul-prompt__actions">
        <Link href="/plaza?compose=1" className="xidig-button xidig-button--primary">
          <XidigIcon name="guul" variant="outline" size={16} tone="inherit" className="x-ic--lead" />
          {t('plaza.guulPromptCta')}
        </Link>
        <button type="button" className="xidig-button xidig-button--secondary" onClick={dismiss}>
          {t('plaza.guulPromptDismiss')}
        </button>
      </div>
    </div>
  );
}
