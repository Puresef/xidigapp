'use client';

import { useCallback, useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { LabView } from '@/lib/labs/views';

import Link from 'next/link';

import { PlainErrorBanner } from '../auth/plain-error';
import { EmptyState } from '../empty-state';
import { FeedEnd } from '../feed/feed-end';
import { LabCard } from './lab-card';

/**
 * Labs Discover list. Explicit "load more" (no infinite scroll) for
 * low-bandwidth (§22). `mode` filters Clubs vs Labs; `mine` scopes to the
 * caller's Spaces. Teaching empty state when nothing matches. Initial load
 * renders card-shaped skeletons matching the LabCard silhouette (header row,
 * one-liner, stage track, activity line, CTA) so the loaded list replaces
 * them without a layout jump; load-more keeps LoadingFlap.
 */

interface FeedPage {
  items: LabView[];
  nextCursor: string | null;
}

function LabsSkeleton({ cards = 3 }: { cards?: number }) {
  const t = useT();
  return (
    <div className="xidig-feed-skeleton" role="status" aria-label={t('state.loading')}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="xidig-skeleton-card" aria-hidden="true">
          <div className="xidig-lab-skeleton__header">
            <span className="xidig-skeleton xidig-skeleton--avatar" />
            <span className="xidig-skeleton xidig-skeleton--text xidig-lab-skeleton__title" />
            <span className="xidig-skeleton xidig-skeleton--chip xidig-lab-skeleton__badge" />
          </div>
          <span className="xidig-skeleton xidig-skeleton--text" />
          <span className="xidig-skeleton xidig-skeleton--text xidig-lab-skeleton__track" />
          <span className="xidig-skeleton xidig-skeleton--text xidig-lab-skeleton__meta" />
          <span className="xidig-skeleton xidig-skeleton--chip xidig-lab-skeleton__cta" />
        </div>
      ))}
    </div>
  );
}

export function LabsFeed({
  mode,
  mine,
  prefs,
}: {
  mode?: 'club' | 'lab' | undefined;
  mine?: boolean | undefined;
  /** Viewer Lite prefs (§22) — passed to card icons (smallAvatars rule). */
  prefs?: LitePrefs | undefined;
}) {
  const t = useT();
  const [items, setItems] = useState<LabView[]>([]);
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
        if (mode) params.set('mode', mode);
        if (mine) params.set('mine', '1');
        if (cursor) params.set('cursor', cursor);
        const qs = params.toString();
        const page = await apiGet<FeedPage>(qs ? `/api/labs?${qs}` : '/api/labs');
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
    [mode, mine],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  if (!loaded && pending) {
    return <LabsSkeleton />;
  }

  return (
    <section aria-label={t('lab.listTitle')}>
      {error ? <PlainErrorBanner error={error} /> : null}

      {loaded && items.length === 0 && !error ? (
        <EmptyState
          messageKey="lab.emptyList"
          action={
            <Link className="xidig-button xidig-button--primary" href="/labs/new">
              {t('lab.createCta')}
            </Link>
          }
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="xidig-post-list">
          {items.map((view) => (
            <li key={view.lab.id}>
              <LabCard view={view} prefs={prefs} />
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
