'use client';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';
import type { MessageKey } from '@xidig/i18n';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import { PlainErrorBanner } from '../auth/plain-error';
import { EmptyState } from '@/components/empty-state';
import { LiteMediaProvider } from '../media/lite-media-provider';
import { LiteShowAll } from '../media/lite-show-all';
import { ListingRow, PersonRow, PostRow, SpaceRow } from './result-rows';
import type { SearchResults } from './types';

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
 * Each group renders as ONE card of hairline-separated link rows, and the
 * member's own term is marked in place inside the row content (never inside
 * our own copy — a term appearing in UI text is not a hit). Sorting stays
 * transparent and labeled next to every group; it is never a hidden ranking,
 * and the label is a statement rather than a control, because there is no
 * second order to switch to.
 *
 * Works signed-out: the API serves public projections; posts (members-only,
 * §28) come back empty, so a visitor sees a sign-in hint instead.
 */

export type SearchTab = 'all' | 'people' | 'listings' | 'labs' | 'posts';

const MIN_QUERY_LENGTH = 2;
const GROUP_LIMIT = 5;

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

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function Group({
  title,
  count,
  sortNote,
  moreHref,
  moreLabel,
  showMore,
  children,
}: {
  title: string;
  count: number;
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
        <span className="xidig-search-group__count">{count}</span>
        {/* The order is always stated, even when "See more" joins it — a
            capped group is exactly where a reader most needs to know what
            the five they can see were picked by. */}
        <span className="xidig-search-group__sort">{sortNote}</span>
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

/** Loading shell: the tab strip and three rows, same footprint as the
    results that replace them, so nothing jumps when the fetch lands. */
function ResultsSkeleton() {
  return (
    <div className="xidig-search-skeleton">
      <div className="xidig-search-skeleton__tabs">
        {[84, 110, 130, 104, 96].map((width) => (
          <span key={width} className="xidig-skeleton xidig-skeleton--chip" style={{ width }} />
        ))}
      </div>
      {[42, 55, 38].map((lead) => (
        <div key={lead} className="xidig-skeleton-card">
          <div className="xidig-search-skeleton__row">
            <span className="xidig-skeleton xidig-skeleton--avatar" />
            <div className="xidig-search-skeleton__lines">
              <span
                className="xidig-skeleton xidig-skeleton--text"
                style={{ width: `${lead}%` }}
              />
              <span
                className="xidig-skeleton xidig-skeleton--text"
                style={{ width: `${lead + 30}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
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

  const GROUP_ROWS: Record<EntityTab, () => ReactNode> = {
    people: () =>
      results?.people.map((person) => (
        <PersonRow key={person.userId} person={person} query={searched} prefs={prefs} />
      )),
    listings: () =>
      results?.listings.map((listing) => (
        <ListingRow key={listing.id} listing={listing} query={searched} prefs={prefs} />
      )),
    labs: () =>
      results?.labs.map((lab) => <SpaceRow key={lab.id} lab={lab} query={searched} />),
    posts: () =>
      results?.posts.map((post) => (
        <PostRow key={post.id} post={post} query={searched} prefs={prefs} />
      )),
  };

  /** People/business "See more" carries the query to the owning surface. */
  function moreHrefFor(tab: EntityTab): string {
    const encoded = encodeURIComponent(searched);
    if (tab === 'people') return `/suuq?q=${encoded}`;
    if (tab === 'listings') return `/suuq?tab=businesses&q=${encoded}`;
    if (tab === 'labs') return '/labs';
    return '/plaza';
  }

  /** The fullest other tab, so an empty tab can point somewhere useful. */
  function bestOtherTab(tab: EntityTab): EntityTab | null {
    const others = ENTITY_TABS.filter((other) => other !== tab && counts[other] > 0);
    if (others.length === 0) return null;
    return others.reduce((best, other) => (counts[other] > counts[best] ? other : best));
  }

  function renderTabEmpty(tab: EntityTab): ReactNode {
    // Posts are members-only (§28): a visitor's empty posts tab is a
    // sign-in teach, not a "no matches".
    if (tab === 'posts' && !signedIn) {
      return (
        <EmptyState
          messageKey="search.postsMembersOnly"
          action={
            <Link className="xidig-button xidig-button--primary" href="/signin">
              {t('action.signIn')}
            </Link>
          }
        />
      );
    }
    const empty = EMPTY_KEYS[tab];
    // Prefer the cross-tab jump: a search that found nothing HERE but three
    // posts elsewhere should say so, rather than send the member browsing.
    const elsewhere = bestOtherTab(tab);
    return (
      <EmptyState
        titleKey="search.emptyTitle"
        messageKey={empty.body}
        params={{ query: searched }}
        action={
          elsewhere ? (
            <Link
              className="xidig-button xidig-button--secondary"
              href={searchHref(searched, elsewhere)}
            >
              {t('search.crossTabCta', {
                count: counts[elsewhere],
                label: t(TAB_LABEL_KEYS[elsewhere]),
              })}
            </Link>
          ) : (
            <Link className="xidig-button xidig-button--secondary" href={empty.href}>
              {t(empty.cta)}
            </Link>
          )
        }
      />
    );
  }

  const activeLabel =
    activeTab === 'all' ? t('search.tabAll') : t(TAB_LABEL_KEYS[activeTab as EntityTab]);

  return (
    <div className="xidig-search">
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
      {pending ? <ResultsSkeleton /> : null}

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
          {/* Lite coordination for result thumbs (listing rows are MediaSlots):
              deferred slots join a page-level "N hidden — Show all". */}
          <LiteMediaProvider>
            <p className="xidig-search-eyebrow">
              {t('search.resultsFor', { label: activeLabel, query: searched })}
            </p>
            {/* Entity tabs — plain links (?type=), shareable, no client state.
                A nav landmark, not a tablist: these navigate, they do not
                switch panels, and announcing a tab widget would promise
                arrow-key behavior that links correctly do not have. */}
            <nav className="xidig-tabs" aria-label={t('search.tabsLabel')}>
              <Link
                className="xidig-tabs__tab"
                href={searchHref(searched, 'all')}
                aria-current={activeTab === 'all' ? 'page' : undefined}
              >
                {t('lab.tabWithCount', { label: t('search.tabAll'), count: total })}
              </Link>
              {ENTITY_TABS.map((tab) => (
                <Link
                  key={tab}
                  className="xidig-tabs__tab"
                  href={searchHref(searched, tab)}
                  aria-current={activeTab === tab ? 'page' : undefined}
                >
                  {t('lab.tabWithCount', { label: t(TAB_LABEL_KEYS[tab]), count: counts[tab] })}
                </Link>
              ))}
            </nav>
            <p className="xidig-search-note">
              <InfoIcon />
              {t('search.sortTransparency')}
            </p>
            <LiteShowAll />

            {activeTab === 'all' ? (
              total === 0 ? (
                <EmptyState
                  titleKey="search.emptyTitle"
                  messageKey="search.noResults"
                  params={{ query: searched }}
                  {...(signedIn
                    ? {}
                    : {
                        action: (
                          <Link className="xidig-button xidig-button--secondary" href="/signin">
                            {t('action.signIn')}
                          </Link>
                        ),
                      })}
                />
              ) : (
                ENTITY_TABS.filter((tab) => counts[tab] > 0).map((tab) => (
                  <Group
                    key={tab}
                    title={t(TAB_LABEL_KEYS[tab])}
                    count={counts[tab]}
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
                count={counts[activeTab]}
                sortNote={t(SORT_KEYS[activeTab])}
                moreHref={moreHrefFor(activeTab)}
                moreLabel={t('search.seeMore')}
                showMore={counts[activeTab] >= GROUP_LIMIT}
              >
                {GROUP_ROWS[activeTab]()}
              </Group>
            )}
          </LiteMediaProvider>
        </div>
      ) : null}
    </div>
  );
}
