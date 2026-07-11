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
    <div className="xidig-profile__actions">
      {canNativeShare ? (
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          onClick={() => void nativeShare()}
        >
          {t('action.share')}
        </button>
      ) : null}
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        onClick={() => void copy()}
      >
        {copied ? t('action.linkCopied') : t('action.copyLink')}
      </button>
    </div>
  );
}
