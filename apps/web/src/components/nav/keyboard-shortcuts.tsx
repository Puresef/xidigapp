'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { shortcutFor } from '@/lib/nav/shortcuts';
import { COMPOSE_EVENT } from '@/lib/plaza/constants';

/**
 * Chrome-mounted global shortcuts: `/` focuses the header search, `c` opens
 * the composer (in place on /plaza, via ?compose=1 elsewhere — same paths as
 * the contextual Create button). Renders nothing.
 */
export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
          (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target.isContentEditable),
      );
      const action = shortcutFor(event.key, {
        typing,
        modifier: event.ctrlKey || event.metaKey || event.altKey,
      });
      if (!action) return;
      event.preventDefault();
      if (action === 'search') {
        document.querySelector<HTMLInputElement>('.xidig-header-search__input')?.focus();
        return;
      }
      // compose — read the live pathname; the listener outlives soft navs.
      const path = window.location.pathname;
      if (path === '/plaza' || path.startsWith('/plaza/')) {
        window.dispatchEvent(new CustomEvent(COMPOSE_EVENT, { detail: {} }));
      } else {
        router.push('/plaza?compose=1');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return null;
}
