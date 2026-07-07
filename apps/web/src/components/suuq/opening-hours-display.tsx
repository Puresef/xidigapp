'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { asOpeningHours, DAY_KEYS, isOpenNow } from '@/lib/listings';

import { DAY_LABEL_KEYS } from './opening-hours-editor';

/**
 * Opening hours display grid + "Open now" chip (§18, Phase 4.5 — v1
 * display-only). The chip is computed CLIENT-SIDE from the viewer's clock,
 * inside an effect so SSR and the first client render agree (no hydration
 * mismatch, and no stale server-rendered verdict in caches).
 *
 * TIMEZONE CAVEAT (v1): stored times are the business's local wall clock and
 * the check uses the VIEWER's clock — exact when both are in the same city
 * (the primary Suuq case), approximate for diaspora viewers. A listing
 * timezone column is the future fix; see lib/listings.ts isOpenNow.
 */

export function OpenNowChip({ hours }: { hours: unknown }) {
  const t = useT();
  const [openNow, setOpenNow] = useState<boolean | null>(null);

  useEffect(() => {
    const parsed = asOpeningHours(hours);
    setOpenNow(parsed === null ? null : isOpenNow(parsed));
  }, [hours]);

  if (openNow !== true) return null;
  return <span className="xidig-tag xidig-tag--ok">{t('suuq.openNow')}</span>;
}

export function OpeningHoursDisplay({ hours }: { hours: unknown }) {
  const t = useT();
  const parsed = asOpeningHours(hours);
  if (parsed === null) return null;

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">
        {t('suuq.hoursLabel')} <OpenNowChip hours={hours} />
      </h2>
      <dl className="xidig-hours-grid">
        {DAY_KEYS.map((day) => (
          <div key={day} className="xidig-hours-grid__row">
            <dt className="xidig-hours-grid__day">{t(DAY_LABEL_KEYS[day])}</dt>
            <dd className="xidig-hours-grid__times">
              {parsed[day].length === 0
                ? t('suuq.closedDay')
                : parsed[day].map((i) => `${i.open}–${i.close}`).join(', ')}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
