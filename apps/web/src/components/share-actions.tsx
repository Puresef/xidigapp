'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

/**
 * Share affordances for permalinks (§28 WhatsApp-first growth loop): a
 * "Share on WhatsApp" deep link and a copy-link button. `path` is the
 * app-relative permalink; the absolute origin resolves after mount so SSR
 * and the first client render agree (no hydration mismatch).
 */
export function ShareActions({ path, text }: { path: string; text: string }) {
  const t = useT();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = origin ? `${origin}${path}` : path;

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
      <a
        className="xidig-button xidig-button--secondary"
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t('action.shareWhatsApp')}
      </a>
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
