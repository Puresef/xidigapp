'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { FeedSkeleton } from '@/components/feed/feed-skeleton';
import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { LoadingFlap } from '@/components/loading-flap';
import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { PostView } from '@/lib/plaza/views';

import { COMPOSE_EVENT } from '@/lib/plaza/constants';

import { PlainErrorBanner } from '../auth/plain-error';
import { EmptyState } from '../empty-state';
import { FeedEnd } from '../feed/feed-end';
import { PostCard } from './post-card';

/**
 * Global Plaza feed. Explicit "load more" instead of infinite scroll —
 * deliberate for low-bandwidth connections (§22). The pinned weekly
 * highlights strip (§15) only shows on the unfiltered view and is fetched
 * best-effort: if it fails, the feed still renders.
 */

type PlazaType = 'intro' | 'ask' | 'win' | 'update' | 'poll';

const EMPTY_KEYS: Record<PlazaType, MessageKey> = {
  intro: 'plaza.emptyIntro',
  ask: 'plaza.emptyAsk',
  win: 'plaza.emptyWin',
  update: 'plaza.emptyUpdate',
  poll: 'plaza.emptyPoll',
};

interface FeedPage {
  items: PostView[];
  nextCursor: string | null;
}

export function PlazaFeed({
  type,
  viewerId,
  lowBandwidth,
  prefs,
  composeHref,
}: {
  type?: PlazaType | undefined;
  viewerId: string;
  /** Legacy boolean — used by PostCard only when `prefs` is absent. */
  lowBandwidth: boolean;
  /** Granular Lite prefs (§22); wins over `lowBandwidth` in each PostCard. */
  prefs?: LitePrefs | undefined;
  /**
   * Surfaces WITHOUT a mounted composer (Home's Latest tab) pass a link
   * target (/plaza?compose=1) so the empty-state CTA navigates instead of
   * dispatching COMPOSE_EVENT into a page nothing is listening on.
   */
  composeHref?: string | undefined;
}) {
  const t = useT();
  const [items, setItems] = useState<PostView[]>([]);
  const [pinned, setPinned] = useState<PostView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setPending(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (type) params.set('type', type);
        if (cursor) params.set('cursor', cursor);
        const qs = params.toString();
        const page = await apiGet<FeedPage>(qs ? `/api/posts?${qs}` : '/api/posts');
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
    void load(null);
  }, [load]);

  useEffect(() => {
    if (type) {
      setPinned([]);
      return;
    }
    let cancelled = false;
    apiGet<{ items: PostView[] }>('/api/posts?pinned=1')
      .then((page) => {
        if (!cancelled) setPinned(page.items);
      })
      .catch(() => {
        // Highlights are a bonus strip — a failed fetch never blocks the feed.
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  if (!loaded && pending) {
    return <FeedSkeleton />;
  }

  return (
    <LiteMediaProvider>
      <section aria-label={t('nav.plaza')}>
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

        {/* Page-level "N hidden — Show all" bar (§22): the feed is the most
            media-dense surface, so batch-reveal belongs here most of all. */}
        <LiteShowAll />

        {!type && pinned.length > 0 ? (
          <section>
            <h2 className="xidig-section__title">{t('plaza.pinnedHeading')}</h2>
            <ul className="xidig-post-list">
              {pinned.map((view) => (
                <li key={view.post.id}>
                  <PostCard
                    view={view}
                    viewerId={viewerId}
                    lowBandwidth={lowBandwidth}
                    prefs={prefs}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {loaded && items.length === 0 && !error ? (
          <EmptyState
            messageKey={type ? EMPTY_KEYS[type] : 'state.emptyFeed'}
            action={
              composeHref ? (
                <Link href={composeHref} className="xidig-button xidig-button--primary">
                  {t('plaza.emptyCta')}
                </Link>
              ) : (
                <button
                  type="button"
                  className="xidig-button xidig-button--primary"
                  onClick={() =>
                    // detail.type carries the active filter so "No polls yet →
                    // Start the first post" opens the composer ON the Poll tab.
                    window.dispatchEvent(new CustomEvent(COMPOSE_EVENT, { detail: { type } }))
                  }
                >
                  {t('plaza.emptyCta')}
                </button>
              )
            }
          />
        ) : null}

        {items.length > 0 ? (
          <ul className="xidig-post-list">
            {items.map((view) => (
              <li key={view.post.id}>
                <PostCard
                  view={view}
                  viewerId={viewerId}
                  lowBandwidth={lowBandwidth}
                  prefs={prefs}
                />
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
