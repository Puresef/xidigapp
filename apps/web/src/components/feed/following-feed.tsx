'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { LoadingComet } from '@/components/loading-comet';
import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { FeedItem, FeedPage, LabUpdateFeedItem } from '@/lib/feed/types';
import { LITE_BUNDLES, type LitePrefs } from '@/lib/lite/prefs';

import { PostCard } from '../plaza/post-card';
import { PlainErrorBanner } from '../auth/plain-error';
import { SuggestedFollows } from '../profile/suggested-follows';
import { ListingCard } from '../suuq/listing-card';
import { FeedEnd } from './feed-end';

/**
 * Following feed on Home (§13). Broader than the Phase 1 listings-only feed:
 * posts + lab updates + listings from the people/Spaces the caller follows.
 * Each item renders its own card by type. Explicit "load more" instead of
 * infinite scroll — deliberate for low-bandwidth connections (§22).
 *
 * The empty state teaches: an empty Following feed is exactly when suggested
 * follows help, so it keeps SuggestedFollows plus a nudge to follow people and
 * Spaces (preserving the Phase 1 empty behavior).
 */

export function FollowingFeed({
  viewerId,
  prefs,
}: {
  viewerId: string;
  /** Granular Lite prefs (§22) threaded from the Home page. */
  prefs?: LitePrefs | undefined;
}) {
  const t = useT();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const litePrefs = prefs ?? LITE_BUNDLES.everything;

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
    return <LoadingComet />;
  }

  return (
    <LiteMediaProvider>
      <section aria-label={t('feed.title')}>
        {error ? <PlainErrorBanner error={error} /> : null}

        {/* Page-level "N hidden — Show all" bar (§22) for the media in the feed. */}
        {items.length > 0 ? <LiteShowAll /> : null}

        {loaded && items.length === 0 && !error ? (
          <div className="xidig-section xidig-empty-sky">
            <p className="xidig-card__body">{t('feed.empty')}</p>
            <p className="xidig-card__meta">{t('feed.emptyHint')}</p>
            <Link href="/suuq" className="xidig-button xidig-button--secondary">
              {t('nav.suuq')} →
            </Link>
            {/* Phase 4.5: an empty following feed is exactly when suggestions help. */}
            <SuggestedFollows />
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="xidig-post-list">
            {items.map((item) => (
              <li key={feedItemKey(item)}>
                {renderItem(item, viewerId, litePrefs, t)}
                <WhyThis item={item} />
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
          <FeedEnd />
        ) : null}
      </section>
    </LiteMediaProvider>
  );
}

/**
 * "Why am I seeing this" (brand-rethink adoption): a per-card disclosure whose
 * copy is MECHANISM-TRUE to the following_feed view's union predicates
 * (docs/rls-following-feed.md): posts ← users you follow; lab updates ← labs
 * you follow OR are a member of (the view can't say which, so the copy covers
 * both); listings ← users you follow. A <details> keeps card density flat —
 * the pledge is one tap away, never noise. Items whose source name is
 * unavailable (deactivated author) render no disclosure rather than a vague
 * claim.
 */
function WhyThis({ item }: { item: FeedItem }) {
  const t = useT();
  let reason: string | null = null;
  if (item.type === 'post' && item.view.author) {
    reason = t('feed.whyPost', { name: item.view.author.display_name });
  } else if (item.type === 'lab_update') {
    reason = t('feed.whyLab', { name: item.update.labName });
  } else if (item.type === 'listing' && item.owner) {
    reason = t('feed.whyListing', { name: item.owner.display_name });
  }
  if (!reason) return null;
  return (
    <details className="xidig-feed-why">
      <summary>{t('feed.whyThis')}</summary>
      <p>{reason}</p>
    </details>
  );
}

function feedItemKey(item: FeedItem): string {
  if (item.type === 'post') return `post:${item.view.post.id}`;
  if (item.type === 'lab_update') return `lab_update:${item.update.id}`;
  return `listing:${item.listing.id}`;
}

function renderItem(
  item: FeedItem,
  viewerId: string,
  prefs: LitePrefs,
  t: ReturnType<typeof useT>,
): React.ReactNode {
  if (item.type === 'post') {
    return (
      <PostCard view={item.view} viewerId={viewerId} lowBandwidth={false} prefs={prefs} />
    );
  }
  if (item.type === 'lab_update') {
    return <LabUpdateCard update={item.update} />;
  }
  return (
    <ListingCard
      listing={item.listing}
      byline={
        item.owner ? t('feed.newListingFrom', { name: item.owner.display_name }) : undefined
      }
      prefs={prefs}
      signedIn
    />
  );
}

/** Compact lab-update card (§16). Chrome swaps Warshad/Koox via space_mode. */
function LabUpdateCard({ update }: { update: LabUpdateFeedItem['update'] }) {
  const t = useT();
  const { locale } = useLocale();
  const kindLabel = update.spaceMode === 'club' ? t('term.club') : t('term.lab');
  const href = update.labSlug ? `/labs/${update.labSlug}` : null;

  return (
    <article className="xidig-card">
      <p className="xidig-chip-row">
        <span className="xidig-tag">{t('feed.labUpdateTag', { kind: kindLabel })}</span>
        {update.isCrossPost ? (
          <span className="xidig-tag">{t('feed.labUpdateCrossPost')}</span>
        ) : null}
      </p>
      <p className="xidig-card__meta">
        {href ? <Link href={href}>{update.labName}</Link> : update.labName}
        {' · '}
        {formatRelativeTime(new Date(update.createdAt), locale)}
      </p>
      {update.title ? <h3 className="xidig-card__title">{update.title}</h3> : null}
      <p className="xidig-card__body">{update.body}</p>
      {update.author ? (
        <p className="xidig-card__meta">
          {t('feed.labUpdateBy', { name: update.author.display_name })}
        </p>
      ) : null}
      {href ? (
        <p className="xidig-card__meta">
          <Link href={href}>{t('feed.labUpdateOpen')} →</Link>
        </p>
      ) : null}
    </article>
  );
}
