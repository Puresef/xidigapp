'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

/**
 * Share affordances for permalinks (§28 growth loop): the OS share sheet
 * where the Web Share API exists (Phase 4.5 — feature-detected after mount,
 * so SSR and the first client render agree), plus a copy-link button as the
 * universal fallback. Channel-nameless by ruling (11 Jul, directive-8
 * Option B — docs/front-door-standard.md §5.2): the share sheet lets the
 * visitor pick ANY app, the widest marketing spread; no named per-channel
 * deep links. `path` is the app-relative permalink; the absolute origin
 * resolves after mount.
 */
export function ShareActions({ path, text }: { path: string; text: string }) {
  const t = useT();
  const [origin, setOrigin] = useState('');
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator.share === 'function');
  }, []);

  const url = origin ? `${origin}${path}` : path;

  async function nativeShare() {
    try {
      await navigator.share({ text, url });
    } catch {
      // User dismissed the sheet (AbortError) or the share failed — the
      // copy-link fallback is right there; nothing to report.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (http / permissions) — quietly do nothing; the URL
      // is already in the address bar.
    }
  }

  return (
    <div className="xidig-post-actions">
      {canNativeShare ? (
        <button
          type="button"
          className="xidig-icon-button"
          onClick={() => void nativeShare()}
          aria-label={t('action.share')}
          title={t('action.share')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        className={`xidig-icon-button${copied ? ' xidig-icon-button--done' : ''}`}
        onClick={() => void copy()}
        aria-label={copied ? t('action.linkCopied') : t('action.copyLink')}
        title={copied ? t('action.linkCopied') : t('action.copyLink')}
      >
        {copied ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" />
            <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5" />
          </svg>
        )}
      </button>
    </div>
  );
}
