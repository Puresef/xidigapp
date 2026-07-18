'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useLocale, useT } from '@xidig/i18n/react';

import { PostCard } from '@/components/plaza/post-card';
import { LoadingFlap } from '@/components/loading-flap';
import { CHROME_KEYS } from '@/lib/labs/labels';
import type { LabView } from '@/lib/labs/views';
import type { ListingView } from '@/lib/listing-view';
import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { PostView } from '@/lib/plaza/views';
import type { BookmarkEntityType } from '@/lib/social/entities';

import { PlainErrorBanner } from '../auth/plain-error';
import { FeedEnd } from '../feed/feed-end';
import { BookmarkButton } from './bookmark-button';

/**
 * One tab of the Saved page (Phase 4.5): keyset "load more" list over
 * GET /api/me/bookmarks?type=. Posts render through the real PostCard (same
 * card as the feed, Lite-aware); businesses and Spaces get compact cards
 * linking home. Every card keeps its BookmarkButton so unsaving is one tap —
 * the item stays visible until the next visit (undo-friendly).
 */

interface BookmarkListItem {
  entityType: BookmarkEntityType;
  entityId: string;
  createdAt: string;
  post?: PostView;
  listing?: ListingView;
  lab?: LabView;
}

interface BookmarksPage {
  items: BookmarkListItem[];
  nextCursor: string | null;
}

export function SavedList({
  type,
  viewerId,
  prefs,
}: {
  type: BookmarkEntityType;
  viewerId: string;
  prefs: LitePrefs;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [items, setItems] = useState<BookmarkListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setPending(true);
      setError(null);
      try {
        const params = new URLSearchParams({ type });
        if (cursor) params.set('cursor', cursor);
        const page = await apiGet<BookmarksPage>(`/api/me/bookmarks?${params.toString()}`);
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        setLoaded(true);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    },
    [type],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setLoaded(false);
    void load(null);
  }, [load]);

  if (!loaded && pending) {
    return <LoadingFlap />;
  }

  return (
    <section aria-label={t('saved.title')}>
      {error ? <PlainErrorBanner error={error} /> : null}

      {loaded && items.length === 0 && !error ? (
        <div className="xidig-section">
          <p className="xidig-card__body">{t('saved.empty')}</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="xidig-post-list">
          {items.map((item) => (
            <li key={`${item.entityType}:${item.entityId}`}>
              {item.post ? (
                <PostCard view={item.post} viewerId={viewerId} lowBandwidth={false} prefs={prefs} />
              ) : item.listing ? (
                <article className="xidig-card">
                  <h3 className="xidig-card__title">
                    <Link href={`/l/${item.listing.listing.id}`}>
                      {item.listing.listing.business_name}
                    </Link>
                  </h3>
                  <p className="xidig-card__meta">
                    {item.listing.categoryName
                      ? locale === 'so' && item.listing.categoryName.so
                        ? item.listing.categoryName.so
                        : item.listing.categoryName.en
                      : null}
                    {item.listing.listing.city ? ` · ${item.listing.listing.city}` : null}
                  </p>
                  {item.listing.listing.short_description ? (
                    <p className="xidig-card__body">{item.listing.listing.short_description}</p>
                  ) : null}
                  <BookmarkButton
                    entityType="listing"
                    entityId={item.entityId}
                    initialBookmarked
                    signedIn
                  />
                </article>
              ) : item.lab ? (
                <article className="xidig-card">
                  <h3 className="xidig-card__title">
                    <Link href={`/labs/${item.lab.lab.slug}`}>{item.lab.lab.name}</Link>
                  </h3>
                  <p className="xidig-chip-row">
                    <span className="xidig-tag">{t(CHROME_KEYS[item.lab.kind])}</span>
                    <span className="xidig-card__meta">
                      {t('lab.memberCount', { count: item.lab.memberCount })}
                    </span>
                  </p>
                  {item.lab.lab.short_description ? (
                    <p className="xidig-card__body">{item.lab.lab.short_description}</p>
                  ) : null}
                  <BookmarkButton
                    entityType="lab"
                    entityId={item.entityId}
                    initialBookmarked
                    signedIn
                  />
                </article>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {nextCursor ? (
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void load(nextCursor)}
          >
            {t('action.loadMore')}
          </button>
        </p>
      ) : loaded && items.length > 0 ? (
        <FeedEnd messageKey="state.endOfList" />
      ) : null}
    </section>
  );
}
