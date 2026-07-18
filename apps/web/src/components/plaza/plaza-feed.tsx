'use client';

import { useCallback, useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { LiteMediaProvider } from '@/components/media/lite-media-provider';
import { LiteShowAll } from '@/components/media/lite-show-all';
import { LoadingFlap } from '@/components/loading-flap';
import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { PostView } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../auth/plain-error';
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
}: {
  type?: PlazaType | undefined;
  viewerId: string;
  /** Legacy boolean — used by PostCard only when `prefs` is absent. */
  lowBandwidth: boolean;
  /** Granular Lite prefs (§22); wins over `lowBandwidth` in each PostCard. */
  prefs?: LitePrefs | undefined;
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
    return <LoadingFlap />;
  }

  return (
    <LiteMediaProvider>
      <section aria-label={t('nav.plaza')}>
        {error ? <PlainErrorBanner error={error} /> : null}

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
          <div className="xidig-section">
            <p className="xidig-card__body">{type ? t(EMPTY_KEYS[type]) : t('state.emptyFeed')}</p>
          </div>
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
