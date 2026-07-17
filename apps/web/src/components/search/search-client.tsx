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
import { LoadingComet } from '@/components/loading-comet';
import { Avatar } from '../media/avatar';
import { MediaSlot } from '../media/media-slot';

/**
 * Global search (Phase 4.5 DISCOVERY, extras item 3): one box, one fetch,
 * URL-driven entity tabs. Explicit submit only — no as-you-type requests
 * (§22: every request is one the member asked for; the API is also per-IP
 * rate limited).
 *
 * The URL is the whole state (house pattern, same as /suuq): ?q= makes the
 * search shareable/reload-safe and ?type= picks the tab — tabs are plain
 * links, not client state, so a tab is itself a shareable link. Switching
 * tabs never refetches: the API returns all four groups in one response.
 *
 * Sorting is transparent and labeled next to every group (newest first;
 * Spaces by latest activity) — never a hidden ranking.
 *
 * Works signed-out: the API serves public projections; posts (members-only,
 * §28) come back empty, so a visitor sees a sign-in hint instead.
 */

export type SearchTab = 'all' | 'people' | 'listings' | 'labs' | 'posts';

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

const ENTITY_TABS = ['people', 'listings', 'labs', 'posts'] as const;
type EntityTab = (typeof ENTITY_TABS)[number];

const TAB_LABEL_KEYS: Record<EntityTab, MessageKey> = {
  people: 'search.groupPeople',
  listings: 'search.groupBusinesses',
  labs: 'search.groupSpaces',
  posts: 'search.groupPosts',
};

/** Transparent sort, labeled per group: newest / latest Space activity. */
const SORT_KEYS: Record<EntityTab, MessageKey> = {
  people: 'search.sortNewest',
  listings: 'search.sortNewest',
  labs: 'search.sortActivity',
  posts: 'search.sortNewest',
};

/** Teaching empty state per tab: what the entity is + one CTA. */
const EMPTY_KEYS: Record<EntityTab, { body: MessageKey; cta: MessageKey; href: string }> = {
  people: { body: 'search.emptyPeople', cta: 'search.emptyPeopleCta', href: '/suuq' },
  listings: {
    body: 'search.emptyBusinesses',
    cta: 'search.emptyBusinessesCta',
    href: '/suuq?tab=businesses',
  },
  labs: { body: 'search.emptySpaces', cta: 'search.emptySpacesCta', href: '/labs' },
  posts: { body: 'search.emptyPosts', cta: 'search.emptyPostsCta', href: '/plaza' },
};

function Group({
  title,
  sortNote,
  moreHref,
  moreLabel,
  showMore,
  children,
}: {
  title: string;
  sortNote: string;
  moreHref: string;
  moreLabel: string;
  showMore: boolean;
  children: ReactNode;
}) {
  return (
    <section className="xidig-search-group">
      <div className="xidig-search-group__header">
        <h2 className="xidig-section__title">{title}</h2>
        <span className="xidig-card__meta">{sortNote}</span>
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
  initialType,
  prefs,
  signedIn,
}: {
  initialQuery: string;
  initialType: SearchTab;
  prefs: LitePrefs;
  signedIn: boolean;
}) {
  const t = useT();

  const [q, setQ] = useState(initialQuery);
  // The term the current `results` answer — tab links carry it so a tab
  // stays a shareable URL even after the input is edited without submitting.
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [tooShort, setTooShort] = useState(false);

  // ?type= is the tab state (server-parsed; Link navigation updates it).
  const activeTab = initialType;

  const runSearch = useCallback(async (term: string) => {
    setPending(true);
    setError(null);
    setTooShort(false);
    try {
      const page = await apiGet<SearchResults>(`/api/search?q=${encodeURIComponent(term)}`);
      setResults(page);
      setSearched(term);
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

  function searchHref(term: string, tab: SearchTab): string {
    const typePart = tab === 'all' ? '' : `&type=${tab}`;
    return `/search?q=${encodeURIComponent(term)}${typePart}`;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const term = q.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setTooShort(true);
      setResults(null);
      return;
    }
    // Keep the query + tab shareable/reload-safe without a navigation.
    try {
      window.history.replaceState(null, '', searchHref(term, activeTab));
    } catch {
      // History API unavailable — the search itself still runs.
    }
    void runSearch(term);
  }

  const counts: Record<EntityTab, number> = {
    people: results?.people.length ?? 0,
    listings: results?.listings.length ?? 0,
    labs: results?.labs.length ?? 0,
    posts: results?.posts.length ?? 0,
  };
  const total = counts.people + counts.listings + counts.labs + counts.posts;

  function renderPerson(person: SearchPerson): ReactNode {
    return (
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
              ? ` · ${[person.locationCity, person.locationCountry].filter(Boolean).join(', ')}`
              : ''}
          </p>
        </div>
      </li>
    );
  }

  function renderListing(listing: SearchListing): ReactNode {
    return (
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
    );
  }

  function renderLab(lab: SearchLab): ReactNode {
    return (
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
            {lab.stage in STAGE_KEYS ? t(STAGE_KEYS[lab.stage as keyof typeof STAGE_KEYS]) : lab.stage}
            {lab.shortDescription ? ` · ${lab.shortDescription}` : ''}
          </p>
        </div>
      </li>
    );
  }

  function renderPost(post: SearchPost): ReactNode {
    return (
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
    );
  }

  const GROUP_ROWS: Record<EntityTab, () => ReactNode> = {
    people: () => results?.people.map(renderPerson),
    listings: () => results?.listings.map(renderListing),
    labs: () => results?.labs.map(renderLab),
    posts: () => results?.posts.map(renderPost),
  };

  /** People/business "See more" carries the query to the owning surface. */
  function moreHrefFor(tab: EntityTab): string {
    const encoded = encodeURIComponent(searched);
    if (tab === 'people') return `/suuq?q=${encoded}`;
    if (tab === 'listings') return `/suuq?tab=businesses&q=${encoded}`;
    if (tab === 'labs') return '/labs';
    return '/plaza';
  }

  function renderTabEmpty(tab: EntityTab): ReactNode {
    // Posts are members-only (§28): a visitor's empty posts tab is a
    // sign-in teach, not a "no matches".
    if (tab === 'posts' && !signedIn) {
      return (
        <div className="xidig-card xidig-search-teach">
          <p className="xidig-card__body">{t('search.postsMembersOnly')}</p>
          <p>
            <Link className="xidig-button xidig-button--primary" href="/signin">
              {t('action.signIn')}
            </Link>
          </p>
        </div>
      );
    }
    const empty = EMPTY_KEYS[tab];
    return (
      <div className="xidig-card xidig-search-teach">
        <p className="xidig-card__body">{t(empty.body)}</p>
        <p>
          <Link className="xidig-button xidig-button--secondary" href={empty.href}>
            {t(empty.cta)}
          </Link>
        </p>
      </div>
    );
  }

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
      {pending ? <LoadingComet /> : null}

      {/* Teaching empty state: what one box can find, before any search. */}
      {!results && !pending && !error && !tooShort ? (
        <div className="xidig-card xidig-search-teach">
          <p className="xidig-card__body">{t('search.teachBody')}</p>
          <p className="xidig-card__meta">{t('search.teachExample')}</p>
          {!signedIn ? <p className="xidig-card__meta">{t('search.signInForMore')}</p> : null}
        </div>
      ) : null}

      {results && !pending ? (
        <div aria-live="polite">
          {/* Entity tabs — plain links (?type=), shareable, no client state. */}
          <div className="xidig-tabs">
            <Link
              className="xidig-tabs__tab"
              href={searchHref(searched, 'all')}
              aria-current={activeTab === 'all' ? 'page' : undefined}
            >
              {t('search.tabAll')} ({total})
            </Link>
            {ENTITY_TABS.map((tab) => (
              <Link
                key={tab}
                className="xidig-tabs__tab"
                href={searchHref(searched, tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
              >
                {t(TAB_LABEL_KEYS[tab])} ({counts[tab]})
              </Link>
            ))}
          </div>
          <p className="xidig-card__meta">{t('search.sortTransparency')}</p>

          {activeTab === 'all' ? (
            total === 0 ? (
              <div className="xidig-card xidig-search-teach">
                <p className="xidig-card__body">{t('search.noResults')}</p>
                {!signedIn ? (
                  <p className="xidig-card__meta">{t('search.signInForMore')}</p>
                ) : null}
              </div>
            ) : (
              ENTITY_TABS.filter((tab) => counts[tab] > 0).map((tab) => (
                <Group
                  key={tab}
                  title={t(TAB_LABEL_KEYS[tab])}
                  sortNote={t(SORT_KEYS[tab])}
                  moreHref={moreHrefFor(tab)}
                  moreLabel={t('search.seeMore')}
                  showMore={counts[tab] >= GROUP_LIMIT}
                >
                  {GROUP_ROWS[tab]()}
                </Group>
              ))
            )
          ) : counts[activeTab] === 0 ? (
            renderTabEmpty(activeTab)
          ) : (
            <Group
              title={t(TAB_LABEL_KEYS[activeTab])}
              sortNote={t(SORT_KEYS[activeTab])}
              moreHref={moreHrefFor(activeTab)}
              moreLabel={t('search.seeMore')}
              showMore={counts[activeTab] >= GROUP_LIMIT}
            >
              {GROUP_ROWS[activeTab]()}
            </Group>
          )}
        </div>
      ) : null}
    </div>
  );
}
