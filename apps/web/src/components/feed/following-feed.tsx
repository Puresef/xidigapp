'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { PlainErrorBanner } from '../auth/plain-error';
import { SuggestedFollows } from '../profile/suggested-follows';
import { ListingCard, type ListingRow } from '../suuq/listing-card';

/**
 * Following feed on Home (§13). Explicit "load more" instead of infinite
 * scroll — deliberate for low-bandwidth connections (§22).
 */

interface FeedItem {
  type: 'listing';
  listing: ListingRow;
  owner: { display_name: string; handle: string } | null;
}

interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export function FollowingFeed() {
  const t = useT();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const load = useCallback(async (cursor: string | null) => {
    setPending(true);
    setError(null);
    try {
      const page = await apiGet<FeedPage>(
        cursor ? `/api/me/feed?cursor=${encodeURIComponent(cursor)}` : '/api/me/feed',
      );
      setItems((current) => (cursor ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  if (!loaded && pending) {
    return <p className="xidig-card__meta">{t('state.loading')}</p>;
  }

  return (
    <section aria-label={t('feed.title')}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {loaded && items.length === 0 && !error ? (
        <div className="xidig-section">
          <p className="xidig-card__body">{t('feed.empty')}</p>
          <Link href="/suuq" className="xidig-button xidig-button--secondary">
            {t('nav.suuq')} →
          </Link>
          {/* Phase 4.5: an empty following feed is exactly when suggestions help. */}
          <SuggestedFollows />
        </div>
      ) : null}
      <ul className="xidig-card-grid">
        {items.map((item) => (
          <ListingCard
            key={item.listing.id}
            listing={item.listing}
            byline={
              item.owner
                ? t('feed.newListingFrom', { name: item.owner.display_name })
                : undefined
            }
          />
        ))}
      </ul>
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
        <p className="xidig-card__meta">{t('state.endOfList')}</p>
      ) : null}
    </section>
  );
}
