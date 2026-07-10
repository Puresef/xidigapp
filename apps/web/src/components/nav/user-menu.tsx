'use client';

import Link from 'next/link';
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { LanguageToggle } from '@/components/language-toggle';
import { Avatar } from '@/components/media/avatar';
import type { HeaderViewer } from '@/lib/auth/header-viewer';
import { apiPost } from '@/lib/api-client';
import { createClient } from '@/lib/supabase-browser';

/**
 * Account menu (7 Jul nav review) — the home for what used to be top-level tabs
 * (Profile / Saved / Settings) plus the language toggle and sign-out, behind an
 * avatar button. Server-provided viewer identity (no fetch/flash). Signed-out
 * visitors get a plain Sign-in link instead of the menu.
 */

const LINKS: ReadonlyArray<{ labelKey: MessageKey; href: string }> = [
  { labelKey: 'nav.profile', href: '/profile' },
  { labelKey: 'nav.events', href: '/events' },
  { labelKey: 'nav.saved', href: '/saved' },
  { labelKey: 'nav.leaderboard', href: '/leaderboard' },
  { labelKey: 'nav.awards', href: '/awards' },
  { labelKey: 'nav.settings', href: '/settings' },
];

export function UserMenu({ viewer }: { viewer: HeaderViewer }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape/outside-click closes; Escape also returns focus to the trigger so a
  // keyboard user is never stranded at the top of the document.
  const closeAndRestore = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // The role="menu" panel promises the standard menu keyboard model. Gather the
  // menuitem elements so open/arrow/Home/End can move roving focus between them.
  const menuItems = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }, []);

  // Move focus into the panel (first item) when it opens — the role="menu"
  // contract requires focus to enter the widget, not stay on the trigger.
  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();
  }, [open, menuItems]);

  // Close on outside click or Escape while open.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeAndRestore();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, closeAndRestore]);

  // Roving arrow-key navigation between menuitems (ArrowUp/Down cycle, Home/End
  // jump to ends) — the interaction the role="menu"/role="menuitem" roles promise.
  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Clear this browser's Supabase session, then the server cookies.
      await createClient().auth.signOut();
      await apiPost('/api/auth/signout');
    } catch {
      // Best-effort; fall through to the reload which re-checks auth.
    }
    // Hard navigate so every server component re-renders signed-out.
    window.location.assign('/');
  }

  if (!viewer.signedIn) {
    return (
      <Link href="/signin" className="xidig-button xidig-button--secondary">
        {t('action.signIn')}
      </Link>
    );
  }

  return (
    <div className="xidig-user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="xidig-user-menu__trigger"
        aria-label={t('a11y.userMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar
          name={viewer.displayName}
          handle={viewer.handle || viewer.displayName}
          src={viewer.avatarThumbUrl}
          blurhash={viewer.avatarBlurhash}
          size={32}
        />
      </button>

      {open ? (
        <div className="xidig-user-menu__panel" role="menu" ref={panelRef} onKeyDown={onPanelKeyDown}>
          <div className="xidig-user-menu__identity">
            <span className="xidig-user-menu__name">{viewer.displayName}</span>
            {viewer.handle ? (
              <span className="xidig-user-menu__handle">@{viewer.handle}</span>
            ) : null}
          </div>
          {LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="xidig-user-menu__item"
              onClick={close}
            >
              {t(item.labelKey)}
            </Link>
          ))}
          <div className="xidig-user-menu__row">
            <LanguageToggle />
          </div>
          <button
            type="button"
            role="menuitem"
            className="xidig-user-menu__item xidig-user-menu__item--danger"
            onClick={signOut}
            disabled={signingOut}
          >
            {t('action.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
