'use client';

import { useT } from '@xidig/i18n/react';

import { BackLink } from '@/components/back-link';

/**
 * Detail-page skeleton (E2 s1): mirrors the loaded hierarchy 1:1 — byline
 * disc + chip, title, body lines, media block, footer strip, then two
 * comment rows — so arrival causes zero layout shift. Shimmer obeys the
 * motion double-gate via the shared .xidig-skeleton rules; one live
 * announcement, everything else aria-hidden.
 */
export default function PostDetailLoading() {
  const t = useT();
  return (
    <main className="xidig-section">
      <BackLink href="/plaza" labelKey="nav.plaza" />
      <div className="xidig-feed-skeleton" role="status" aria-label={t('state.loading')}>
        <div className="xidig-skeleton-card" aria-hidden="true">
          <div className="xidig-feed-skeleton__byline">
            <span className="xidig-skeleton xidig-skeleton--avatar" />
            <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__name" />
            <span className="xidig-skeleton xidig-skeleton--chip" />
          </div>
          <span className="xidig-skeleton xidig-skeleton--text" />
          <span className="xidig-skeleton xidig-skeleton--text" />
          <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__short" />
          <span className="xidig-skeleton xidig-skeleton--media" />
          <div className="xidig-feed-skeleton__byline">
            <span className="xidig-skeleton xidig-skeleton--chip" />
            <span className="xidig-skeleton xidig-skeleton--chip" />
          </div>
        </div>
        <div className="xidig-skeleton-card" aria-hidden="true">
          <div className="xidig-feed-skeleton__byline">
            <span className="xidig-skeleton xidig-skeleton--avatar" />
            <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__name" />
          </div>
          <span className="xidig-skeleton xidig-skeleton--text" />
          <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__short" />
        </div>
        <div className="xidig-skeleton-card" aria-hidden="true">
          <div className="xidig-feed-skeleton__byline">
            <span className="xidig-skeleton xidig-skeleton--avatar" />
            <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__name" />
          </div>
          <span className="xidig-skeleton xidig-skeleton--text xidig-feed-skeleton__short" />
        </div>
      </div>
    </main>
  );
}
