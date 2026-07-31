'use client';

import type { ReactNode } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { LoadingComet } from '@/components/loading-comet';

/**
 * Route-level loading shells (Task 9): every loading.tsx mirrors its page's
 * real anchors — the same `<main class="xidig-section">` frame and the same
 * h1 — so the loaded page replaces the shell without a layout jump. Real
 * text is fine here (LocaleProvider wraps every route via the root layout);
 * skeleton pieces are aria-hidden, and the single live announcement comes
 * from LoadingComet's role="status" (or CardListSkeleton's, when it is the
 * page-level treatment).
 */
export function LoadingShell({
  titleKey,
  children,
}: {
  titleKey?: MessageKey;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <main className="xidig-section">
      {titleKey ? <h1 className="xidig-auth__title">{t(titleKey)}</h1> : null}
      {children ?? <LoadingComet />}
    </main>
  );
}

/** Silhouette for a `?filter=` / `?tab=` link row — one pill per tab. */
export function SkeletonTabs({ count }: { count: number }) {
  return (
    <div className="xidig-tabs" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="xidig-skeleton xidig-skeleton--chip" />
      ))}
    </div>
  );
}

/** Input-height bar — stands in for a composer prompt or search field. */
export function SkeletonBar() {
  return <span className="xidig-skeleton xidig-skeleton--bar" aria-hidden="true" />;
}

/**
 * Generic card-list silhouette (directory listings, Spaces): title line +
 * two body lines per card. Reuses the feed-skeleton width modifiers — same
 * family, same footprint discipline; feeds themselves keep FeedSkeleton
 * (byline disc + footer strip).
 */
export function CardListSkeleton({ cards = 3 }: { cards?: number }) {
  const t = useT();
  return (
    <div className="xidig-feed-skeleton" role="status" aria-label={t('state.loading')}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="xidig-skeleton-card" aria-hidden="true">
          <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__name" />
          <span className="xidig-skeleton xidig-skeleton--text" />
          <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__short" />
        </div>
      ))}
    </div>
  );
}
