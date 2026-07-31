'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { FeedSkeleton } from '@/components/feed/feed-skeleton';
import { LoadingFlap } from '@/components/loading-flap';
import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { FeedItem, FeedPage, LabUpdateFeedItem } from '@/lib/feed/types';
import { LITE_BUNDLES, type LitePrefs } from '@/lib/lite/prefs';

import { PostCard } from '../plaza/post-card';
import { PlainErrorBanner } from '../auth/plain-error';
import { EmptyState } from '../empty-state';
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
    return <FeedSkeleton />;
  }

  return (
    <LiteMediaProvider>
      <section aria-label={t('feed.title')}>
        {error ? (
          <>
            <PlainErrorBanner error={error} />
            {/* Initial-load failure (nothing on screen) → explicit Retry.
                Load-more failures keep the Load more button as the retry. */}
            {items.length === 0 ? (
              <p>
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  onClick={() => void load(null)}
                >
                  {t('action.retry')}
                </button>
              </p>
            ) : null}
          </>
        ) : null}

        {/* Page-level "N hidden — Show all" bar (§22) for the media in the feed. */}
        {items.length > 0 ? <LiteShowAll /> : null}

        {loaded && items.length === 0 && !error ? (
          <>
            {/* Shared EmptyState (Task 9) wearing the calm starfield; the
                Latest-tab CTA (Task 7) stays the single action. SuggestedFollows
                sits OUTSIDE it — a row list would fight the centered layout. */}
            <EmptyState
              className="xidig-empty-sky"
              messageKey="feed.empty"
              action={
                <>
                  <p className="xidig-card__meta">{t('feed.emptyHint')}</p>
                  {/* Task 7: the natural next stop for an empty Following feed
                      is the community-wide Latest tab, not the Directory. */}
                  <Link href="/?tab=latest" className="xidig-button xidig-button--secondary">
                    {t('feed.emptyLatestCta')} →
                  </Link>
                </>
              }
            />
            {/* Phase 4.5: an empty following feed is exactly when suggestions help. */}
            <SuggestedFollows />
          </>
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
          pending ? (
            // Load-more in flight: the inline flap, not skeletons (the list
            // above is real content — only the tail is loading).
            <LoadingFlap />
          ) : (
            <p>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                onClick={() => void load(nextCursor)}
              >
                {t('action.loadMore')}
              </button>
            </p>
          )
        ) : loaded && items.length > 0 ? (
          <FeedEnd />
        ) : null}
      </section>
    </LiteMediaProvider>
  );
}

/**
 * "Why am I seeing this" (brand-rethink adoption): a per-card info-icon
 * button opening a small popover (Task 7 — was a <details>; an icon reads as
 * card chrome, not content). A positioned popover, not the Dialog primitive:
 * two lines of static text never justify a focus-trapped modal — the
 * reaction-picker precedent. Opens upward so end-of-list cards don't clip;
 * Escape and re-tap close it.
 *
 * Copy is MECHANISM-TRUE to the following_feed view's union predicates
 * (docs/rls-following-feed.md): posts ← users you follow; lab updates ← labs
 * you follow OR are a member of (the view can't say which, so the copy covers
 * both); listings ← users you follow. Plus the published sort rule ("newest
 * first" — chronological honesty). Items whose source name is unavailable
 * (deactivated author) render no disclosure rather than a vague claim.
 */
function WhyThis({ item }: { item: FeedItem }) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
    <div
      className="xidig-feed-why"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className="xidig-icon-button xidig-feed-why__trigger"
        aria-expanded={open}
        aria-label={t('feed.whyThis')}
        title={t('feed.whyThis')}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      {open ? (
        <div className="xidig-feed-why__panel" role="note">
          <p>{reason}</p>
          <p>{t('feed.sortTransparency')}</p>
        </div>
      ) : null}
    </div>
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
    // as="div": the feed's <ul> already wraps every item in its own keyed
    // <li> (see the items.map above) — the card's default <li> root would
    // nest li>li, which is invalid DOM and a React error.
    <ListingCard
      as="div"
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
