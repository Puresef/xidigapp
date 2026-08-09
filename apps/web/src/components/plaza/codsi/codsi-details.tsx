'use client';

import { useT } from '@xidig/i18n/react';

/**
 * "Faahfaahin" (rail card): only the facts the post actually has — the first
 * tag as category, the asker's profile city, and (post-fulfilment) how long
 * it took. Rows with nothing to say don't render; a card with nothing to say
 * doesn't either. The frames' deadline row ("Ka hor …") is deliberately
 * absent: asks have no deadline field (flagged in the dispatch report).
 */
export function CodsiDetails({
  category,
  location,
  durationDays,
}: {
  category: string | null;
  location: string | null;
  durationDays: number | null;
}) {
  const t = useT();
  if (!category && !location && durationDays === null) return null;
  return (
    <div className="xidig-card xidig-codsi-rail-card">
      <h2 className="xidig-codsi-rail-card__title">{t('plaza.detailsTitle')}</h2>
      <dl className="xidig-codsi-facts">
        {category ? (
          <>
            <dt>{t('plaza.detailsCategory')}</dt>
            <dd>{category}</dd>
          </>
        ) : null}
        {location ? (
          <>
            <dt>{t('plaza.detailsLocation')}</dt>
            <dd>{location}</dd>
          </>
        ) : null}
        {durationDays !== null ? (
          <>
            <dt>{t('plaza.detailsDuration')}</dt>
            <dd>{t('plaza.durationDays', { count: durationDays })}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
