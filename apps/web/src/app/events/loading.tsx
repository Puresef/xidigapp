'use client';

import { useT } from '@xidig/i18n/react';

/**
 * /events segment loading state (frame e1): the skeleton mirrors the loaded
 * 9a list 1:1 — tab pills, then two card silhouettes (date-block square,
 * three text lines, footer line + RSVP pill) — so arrival causes zero layout
 * shift. Shimmer rides the shared .xidig-skeleton primitives, which are
 * already double-gated; no animation is declared here. One live
 * announcement, every decorative node aria-hidden (the p/[id]/loading.tsx
 * conventions).
 */
export default function EventsLoading() {
  const t = useT();
  return (
    <main className="xidig-section xidig-event-page">
      <header className="xidig-event-head">
        <h1 className="xidig-auth__title">{t('events.indexTitle')}</h1>
      </header>
      <div className="xidig-event-list" role="status" aria-label={t('state.loading')}>
        <div className="xidig-event-skeleton__tabs" aria-hidden="true">
          <span className="xidig-skeleton xidig-skeleton--chip" />
          <span className="xidig-skeleton xidig-skeleton--chip" />
        </div>
        <div className="xidig-skeleton-card xidig-event-skeleton__card" aria-hidden="true">
          <div className="xidig-event-skeleton__head">
            <span className="xidig-skeleton xidig-event-skeleton__date" />
            <span className="xidig-event-skeleton__lines">
              <span className="xidig-skeleton xidig-skeleton--text xidig-event-skeleton__l75" />
              <span className="xidig-skeleton xidig-skeleton--text xidig-event-skeleton__l55" />
              <span className="xidig-skeleton xidig-skeleton--text xidig-event-skeleton__l45" />
            </span>
          </div>
          <div className="xidig-event-skeleton__foot">
            <span className="xidig-skeleton xidig-skeleton--text xidig-event-skeleton__l40" />
            <span className="xidig-skeleton xidig-skeleton--chip xidig-event-skeleton__pill" />
          </div>
        </div>
        <div className="xidig-skeleton-card xidig-event-skeleton__card" aria-hidden="true">
          <div className="xidig-event-skeleton__head">
            <span className="xidig-skeleton xidig-event-skeleton__date" />
            <span className="xidig-event-skeleton__lines">
              <span className="xidig-skeleton xidig-skeleton--text xidig-event-skeleton__l68" />
              <span className="xidig-skeleton xidig-skeleton--text xidig-event-skeleton__l50" />
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
