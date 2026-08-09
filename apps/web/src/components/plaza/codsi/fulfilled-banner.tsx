'use client';

import { useT } from '@xidig/i18n/react';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { askDurationDays } from '@/lib/plaza/codsi';
import type { AuthorRef } from '@/lib/plaza/views';

/**
 * The Guul moment (frame 3a/3b): one of exactly three orange surfaces on the
 * fulfilled screen (status chip · this band · the guul glyph). Names the
 * helper when one was accepted; a self-solved ask still celebrates, it just
 * has nobody to credit.
 */
export function FulfilledBanner({
  helper,
  createdAt,
  fulfilledAt,
}: {
  helper: AuthorRef | null;
  createdAt: string;
  fulfilledAt: string | null;
}) {
  const t = useT();
  const duration = t('plaza.durationDays', {
    count: askDurationDays(createdAt, fulfilledAt ?? createdAt),
  });
  return (
    <div className="xidig-codsi-banner">
      <span className="xidig-codsi-banner__glyph" aria-hidden="true">
        <XidigIcon name="guul" variant="filled" size={21} />
      </span>
      <span className="xidig-codsi-banner__text">
        <strong className="xidig-codsi-banner__title">{t('plaza.fulfilledTitle')}</strong>
        <span className="xidig-codsi-banner__line">
          {helper
            ? t('plaza.fulfilledByAfter', { helper: helper.display_name, duration })
            : t('plaza.fulfilledAfter', { duration })}
        </span>
      </span>
    </div>
  );
}
