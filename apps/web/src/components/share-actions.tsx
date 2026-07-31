'use client';

import { useEffect, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

/**
 * ONE share affordance for permalinks (§28 growth loop, Task 7 collapse):
 * a single share icon button opening a small menu — Copy link (universal)
 * plus the OS share sheet where the Web Share API exists (feature-detected
 * after mount, so SSR and the first client render agree). A popover, not a
 * Dialog: two entries never justify a focus-trapped modal, and the DM-menu
 * chrome (.xidig-dm-menu — same dropdown post-overflow-menu reuses) already
 * carries Escape + toggle expectations.
 *
 * Channel-nameless by ruling (11 Jul, directive-8 Option B —
 * docs/front-door-standard.md §5.2): the share sheet lets the visitor pick
 * ANY app, the widest marketing spread; no named per-channel deep links
 * (no wa.me). `path` is the app-relative permalink; the absolute origin
 * resolves after mount.
 */
export function ShareActions({ path, text }: { path: string; text: string }) {
  const t = useT();
  const [origin, setOrigin] = useState('');
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator.share === 'function');
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const url = origin ? `${origin}${path}` : path;

  function nativeShare() {
    setOpen(false);
    navigator.share({ text, url }).catch(() => {
      // User dismissed the sheet (AbortError) or the share failed — the
      // copy-link entry is one tap away; nothing to report.
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      // Feedback lives on the menu entry (check + "Link copied"), then the
      // menu closes itself — the copied state is the confirmation.
      setCopied(true);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1500);
    } catch {
      // Clipboard denied (http / permissions) — quietly do nothing; the URL
      // is already in the address bar.
    }
  }

  return (
    <div
      className="xidig-post-actions xidig-dm-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className="xidig-icon-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('action.share')}
        title={t('action.share')}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </button>

      {open ? (
        <div className="xidig-dm-menu__panel xidig-share-menu" role="menu">
          <ul className="xidig-dm-menu__list">
            <li>
              <button
                type="button"
                role="menuitem"
                className={`xidig-dm-menu__item xidig-share-menu__item${copied ? ' xidig-share-menu__item--done' : ''}`}
                onClick={() => void copy()}
              >
                {copied ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" />
                    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L12.5 19.5" />
                  </svg>
                )}
                {copied ? t('action.linkCopied') : t('action.copyLink')}
              </button>
            </li>
            {canNativeShare ? (
              <li>
                <button
                  type="button"
                  role="menuitem"
                  className="xidig-dm-menu__item xidig-share-menu__item"
                  onClick={nativeShare}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                  </svg>
                  {t('action.share')}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
