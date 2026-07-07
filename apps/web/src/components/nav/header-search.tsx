'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

/**
 * Persistent header search (7 Jul nav review) — replaces the Search tab. Submits
 * to /search?q=, which runs the cross-entity search (people/listings/Labs/posts)
 * on load. Works signed-out (search is public). Kept as a plain form so it
 * degrades without JS and needs no client search state of its own.
 */
export function HeaderSearch() {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/search?q=${encodeURIComponent(term.slice(0, 80))}`);
  }

  return (
    <form role="search" className="xidig-header-search" action="/search" onSubmit={onSubmit}>
      <svg className="xidig-header-search__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="xidig-header-search__input"
        placeholder={t('nav.searchPlaceholder')}
        aria-label={t('a11y.search')}
        maxLength={80}
        autoComplete="off"
      />
    </form>
  );
}
