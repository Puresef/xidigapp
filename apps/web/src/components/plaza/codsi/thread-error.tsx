'use client';

import { useT } from '@xidig/i18n/react';

/**
 * Thread failed to load (state s3): partial failure kept honest — the cached
 * ask above stays readable, only the replies are missing. §27 plain sentence
 * + one retry; no codes, no full-screen wall. System-notice chrome (system
 * voice), rendered inline because it carries an action the shared
 * SystemNotice deliberately doesn't.
 */
export function ThreadError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="xidig-system-notice" role="alert">
      <span className="xidig-system-notice__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.2h.01" />
        </svg>
      </span>
      <div className="xidig-codsi-thread-error__body">
        <p className="xidig-system-notice__text">{t('plaza.threadError')}</p>
        <button type="button" className="xidig-button xidig-button--secondary" onClick={onRetry}>
          {t('action.retry')}
        </button>
      </div>
    </div>
  );
}
