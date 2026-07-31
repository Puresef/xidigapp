'use client';

import { useT } from '@xidig/i18n/react';

/**
 * Initial-load silhouette for post-list feeds (Task 7): three card-shaped
 * skeletons matching the real PostCard anatomy — byline disc + name line,
 * body lines, footer strip — so the loaded feed replaces them without a
 * layout jump. Static-vs-shimmer comes from the Task 3 `.xidig-skeleton`
 * primitives (motion double-gate lives in CSS). Load-more keeps LoadingFlap.
 */
export function FeedSkeleton({ cards = 3 }: { cards?: number }) {
  const t = useT();
  return (
    <div className="xidig-feed-skeleton" role="status" aria-label={t('state.loading')}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="xidig-skeleton-card" aria-hidden="true">
          <div className="xidig-feed-skeleton__byline">
            <span className="xidig-skeleton xidig-skeleton--avatar" />
            <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__name" />
          </div>
          <span className="xidig-skeleton xidig-skeleton--text" />
          <span className="xidig-skeleton xidig-skeleton--text" />
          <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__short" />
          <span className="xidig-skeleton xidig-feed-skeleton__footer" />
        </div>
      ))}
    </div>
  );
}
