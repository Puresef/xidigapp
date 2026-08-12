'use client';

import { useT } from '@xidig/i18n/react';

/**
 * State m1 — the Maal index while it loads.
 *
 * The skeleton wears the row's OWN class (`.xidig-maal-row`), so it inherits
 * the same grid, the same padding and the same desktop/mobile switch as the
 * loaded row: the silhouette mirrors the anatomy 1:1 (glyph tile, name,
 * premise, meta, stage pill, facepile, open-work, action) and arrival costs
 * zero layout shift. A skeleton with its own geometry is a skeleton that drifts.
 *
 * One live region for the whole list (`role="status"` + `aria-busy`), every
 * decorative node `aria-hidden` — the p/[id] and /events loading conventions.
 * No shimmer is declared here: `.xidig-skeleton` carries it, already behind
 * both motion gates.
 */

/** Frame 7a shows four rows; the shell claims the same vertical space. */
const ROWS = 4;
const CHIPS = 4;

export function MaalIndexSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-busy="true" aria-label={t('maal.loadingAria')}>
      <div className="xidig-maal-controls" aria-hidden="true">
        <div className="xidig-maal-filters">
          {Array.from({ length: CHIPS }, (_, index) => (
            <span key={index} className="xidig-skeleton xidig-skeleton--chip" />
          ))}
        </div>
      </div>
      <div className="xidig-maal-table">
        <ul className="xidig-maal-table__rows">
          {Array.from({ length: ROWS }, (_, index) => (
            <li key={index} className="xidig-maal-row" aria-hidden="true">
              <span className="xidig-maal-row__main">
                <span className="xidig-skeleton xidig-maal-skeleton__glyph" />
                <span className="xidig-maal-row__lines">
                  <span className="xidig-skeleton xidig-skeleton--text xidig-maal-skeleton__name" />
                  <span className="xidig-skeleton xidig-skeleton--text xidig-maal-skeleton__premise" />
                  <span className="xidig-skeleton xidig-skeleton--text xidig-maal-skeleton__meta" />
                </span>
              </span>
              <span className="xidig-maal-row__stage">
                <span className="xidig-skeleton xidig-skeleton--chip" />
              </span>
              <span className="xidig-maal-row__members">
                <span className="xidig-skeleton xidig-skeleton--avatar xidig-maal-skeleton__disc" />
                <span className="xidig-skeleton xidig-skeleton--avatar xidig-maal-skeleton__disc" />
              </span>
              <span className="xidig-maal-row__seats">
                <span className="xidig-skeleton xidig-skeleton--text xidig-maal-skeleton__seats" />
              </span>
              <span className="xidig-maal-row__action">
                <span className="xidig-skeleton xidig-skeleton--chip xidig-maal-skeleton__action" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
