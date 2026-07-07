'use client';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';
import type { MessageKey } from '@xidig/i18n';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { CHROME_KEYS, STAGE_KEYS } from '@/lib/labs/labels';
import type { LitePrefs } from '@/lib/lite/prefs';
import { PlainErrorBanner } from '../auth/plain-error';
import { Avatar } from '../media/avatar';
import { MediaSlot } from '../media/media-slot';

/**
 * Global search (Phase 4.5 DISCOVERY): one box, grouped results. Explicit
 * submit only — no as-you-type requests (§22: every request is one the member
 * asked for; the API is also per-IP rate limited). The query rides the URL
 * (?q=) so a search is shareable and survives reload, and each group's
 * "See more" link carries it to the owning surface.
 *
 * Works signed-out: the API serves public projections; posts (members-only,
 * §28) come back empty, so a visitor sees a sign-in hint instead.
 */

const MIN_QUERY_LENGTH = 2;
const GROUP_LIMIT = 5;

interface SearchPerson {
  userId: string;
  displayName: string;
  handle: string;
  locationCity: string | null;
  locationCountry: string | null;
  verificationStatus: string;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
}

interface SearchListing {
  id: string;
  businessName: string;
  shortDescription: string | null;
  city: string | null;
  country: string | null;
  priceRange: number | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  photoBlurhash: string | null;
  photoAlt: string | null;
}

interface SearchLab {
  id: string;
  name: string;
  slug: string;
  spaceMode: string;
  shortDescription: string | null;
  stage: string;
}

interface SearchPost {
  id: string;
  title: string;
  type: string;
  createdAt: string;
}

interface SearchResults {
  people: SearchPerson[];
  listings: SearchListing[];
  labs: SearchLab[];
  posts: SearchPost[];
}

const POST_TYPE_KEYS: Record<string, MessageKey> = {
  intro: 'plaza.typeIntro',
  ask: 'plaza.typeAsk',
  win: 'plaza.typeWin',
  update: 'plaza.typeUpdate',
  poll: 'plaza.typePoll',
};

/** Thumb WebP (480px pipeline) — the only asset a result row ever loads. */
const LISTING_THUMB_EST_BYTES = 30_000;

function Group({
  title,
  moreHref,
  moreLabel,
  showMore,
  children,
}: {
  title: string;
  moreHref: string;
  moreLabel: string;
  showMore: boolean;
  children: ReactNode;
}) {
  return (
    <section className="xidig-search-group">
      <div className="xidig-search-group__header">
        <h2 className="xidig-section__title">{title}</h2>
        {showMore ? (
          <Link className="xidig-search-group__more" href={moreHref}>
            {moreLabel}
          </Link>
        ) : null}
      </div>
      <ul className="xidig-search-list">{children}</ul>
    </section>
  );
}

export function SearchClient({
  initialQuery,
  prefs,
  signedIn,
}: {
  initialQuery: string;
  prefs: LitePrefs;
  signedIn: boolean;
}) {
  const t = useT();

  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [tooShort, setTooShort] = useState(false);

  const runSearch = useCallback(async (term: string) => {
    setPending(true);
    setError(null);
    setTooShort(false);
    try {
      const page = await apiGet<SearchResults>(`/api/search?q=${encodeURIComponent(term)}`);
      setResults(page);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }, []);

  // A shared /search?q= link searches immediately on load.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (booted) return;
    setBooted(true);
    if (initialQuery.trim().length >= MIN_QUERY_LENGTH) {
      void runSearch(initialQuery.trim());
    }
  }, [booted, initialQuery, runSearch]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const term = q.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setTooShort(true);
      setResults(null);
      return;
    }
    // Keep the query shareable/reload-safe without a navigation.
    try {
      window.history.replaceState(null, '', `/search?q=${encodeURIComponent(term)}`);
    } catch {
      // History API unavailable — the search itself still runs.
    }
    void runSearch(term);
  }

  const total = results
    ? results.people.length + results.listings.length + results.labs.length + results.posts.length
    : 0;
  const encoded = encodeURIComponent(q.trim());

  return (
    <div>
      <form className="xidig-toolbar" onSubmit={onSubmit} role="search">
        <div className="xidig-field xidig-field--grow">
          <label className="xidig-field__label" htmlFor="global-search-q">
            {t('search.inputLabel')}
          </label>
          <input
            id="global-search-q"
            className="xidig-field__input"
            type="search"
            // The search box IS this page's purpose — autofocus is the spec'd
            // behavior, not a focus trap.
            autoFocus
            autoComplete="off"
            placeholder={t('search.placeholder')}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {t('action.search')}
        </button>
      </form>

      {tooShort ? (
        <p className="xidig-card__meta" role="status">
          {t('search.minChars', { count: MIN_QUERY_LENGTH })}
        </p>
      ) : null}
      {error ? <PlainErrorBanner error={error} /> : null}
      {pending ? (
        <p className="xidig-card__meta" role="status">
          {t('state.loading')}
        </p>
      ) : null}

      {/* Teaching empty state: what one box can find, before any search. */}
      {!results && !pending && !error && !tooShort ? (
        <div className="xidig-card xidig-search-teach">
          <p className="xidig-card__body">{t('search.teachBody')}</p>
          <p className="xidig-card__meta">{t('search.teachExample')}</p>
          {!signedIn ? <p className="xidig-card__meta">{t('search.signInForMore')}</p> : null}
        </div>
      ) : null}

      {results && !pending && total === 0 ? (
        <div className="xidig-card xidig-search-teach">
          <p className="xidig-card__body">{t('search.noResults')}</p>
          {!signedIn ? <p className="xidig-card__meta">{t('search.signInForMore')}</p> : null}
        </div>
      ) : null}

      {results && total > 0 ? (
        <div aria-live="polite">
          {results.people.length > 0 ? (
            <Group
              title={t('search.groupPeople')}
              moreHref={`/suuq?q=${encoded}`}
              moreLabel={t('search.seeMore')}
              showMore={results.people.length >= GROUP_LIMIT}
            >
              {results.people.map((person) => (
                <li key={person.userId} className="xidig-search-row">
                  <Avatar
                    name={person.displayName}
                    handle={person.handle}
                    src={person.avatarThumbUrl}
                    blurhash={person.avatarBlurhash}
                    size={40}
                    prefs={prefs}
                  />
                  <div className="xidig-search-row__body">
                    <p className="xidig-search-row__title">
                      <Link href={`/u/${person.handle}`}>{person.displayName}</Link>
                    </p>
                    <p className="xidig-card__meta">
                      @{person.handle}
                      {person.locationCity || person.locationCountry
                        ? ` · ${[person.locationCity, person.locationCountry]
                            .filter(Boolean)
                            .join(', ')}`
                        : ''}
                    </p>
                  </div>
                </li>
              ))}
            </Group>
          ) : null}

          {results.listings.length > 0 ? (
            <Group
              title={t('search.groupBusinesses')}
              moreHref={`/suuq?tab=businesses&q=${encoded}`}
              moreLabel={t('search.seeMore')}
              showMore={results.listings.length >= GROUP_LIMIT}
            >
              {results.listings.map((listing) => (
                <li key={listing.id} className="xidig-search-row">
                  {listing.photoThumbUrl ? (
                    <MediaSlot
                      kind="image"
                      src={listing.photoThumbUrl}
                      blurhash={listing.photoBlurhash}
                      alt={listing.photoAlt ?? listing.businessName}
                      estBytes={LISTING_THUMB_EST_BYTES}
                      prefs={prefs}
                      className="xidig-search-row__thumb"
                    />
                  ) : null}
                  <div className="xidig-search-row__body">
                    <p className="xidig-search-row__title">
                      <Link href={`/l/${listing.id}`}>{listing.businessName}</Link>
                    </p>
                    <p className="xidig-card__meta">
                      {[listing.city, listing.country].filter(Boolean).join(', ')}
                      {listing.priceRange ? ` · ${'$'.repeat(listing.priceRange)}` : ''}
                    </p>
                    {listing.shortDescription ? (
                      <p className="xidig-card__meta">{listing.shortDescription}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </Group>
          ) : null}

          {results.labs.length > 0 ? (
            <Group
              title={t('search.groupSpaces')}
              moreHref="/labs"
              moreLabel={t('search.seeMore')}
              showMore={results.labs.length >= GROUP_LIMIT}
            >
              {results.labs.map((lab) => (
                <li key={lab.id} className="xidig-search-row">
                  <div className="xidig-search-row__body">
                    <p className="xidig-search-row__title">
                      <Link href={`/labs/${lab.slug}`}>{lab.name}</Link>{' '}
                      <span className="xidig-tag">
                        {lab.spaceMode === 'club' || lab.spaceMode === 'lab'
                          ? t(CHROME_KEYS[lab.spaceMode])
                          : lab.spaceMode}
                      </span>
                    </p>
                    <p className="xidig-card__meta">
                      {lab.stage in STAGE_KEYS
                        ? t(STAGE_KEYS[lab.stage as keyof typeof STAGE_KEYS])
                        : lab.stage}
                      {lab.shortDescription ? ` · ${lab.shortDescription}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </Group>
          ) : null}

          {results.posts.length > 0 ? (
            <Group
              title={t('search.groupPosts')}
              moreHref="/plaza"
              moreLabel={t('search.seeMore')}
              showMore={results.posts.length >= GROUP_LIMIT}
            >
              {results.posts.map((post) => (
                <li key={post.id} className="xidig-search-row">
                  <div className="xidig-search-row__body">
                    <p className="xidig-search-row__title">
                      <Link href={`/p/${post.id}`}>{post.title}</Link>{' '}
                      {POST_TYPE_KEYS[post.type] ? (
                        <span className="xidig-tag">{t(POST_TYPE_KEYS[post.type]!)}</span>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </Group>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
