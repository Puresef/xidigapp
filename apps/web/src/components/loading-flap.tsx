'use client';

import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';

/**
 * The sitewide inline loading gesture (mark-redesign sweep): the mark breathes
 * (flap) beside the loading text — comets stay on page-level feed waits, this
 * covers everything inline. role="status" announces; text stays visible.
 */
export function LoadingFlap() {
  const t = useT();
  return (
    <p className="xidig-card__meta" role="status">
      <AnimatedMark mode="flap" size={20} className="xidig-flap-inline" />
      {t('state.loading')}
    </p>
  );
}
