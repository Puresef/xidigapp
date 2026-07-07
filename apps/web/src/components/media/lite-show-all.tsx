'use client';

import { useT } from '@xidig/i18n/react';

import { useLiteMedia } from './lite-media-provider';

/**
 * Small "N hidden — Show all on this page" bar for Lite mode (§22). Renders
 * nothing without a LiteMediaProvider, when everything is already shown, or
 * when only a single slot is deferred (its own Show button is enough).
 */
export function LiteShowAll() {
  const t = useT();
  const lite = useLiteMedia();

  if (!lite || lite.showAll || lite.hiddenCount < 2) return null;

  return (
    <div className="xidig-lite-showall">
      <span className="xidig-card__meta">{t('lite.hiddenCount', { count: lite.hiddenCount })}</span>
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        onClick={lite.revealAll}
      >
        {t('lite.showAllPage')}
      </button>
    </div>
  );
}
