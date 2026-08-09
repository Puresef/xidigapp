'use client';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

/**
 * Empty Codsi thread (state s2): a fact — how long the ask has been open —
 * plus a pointer at the composer. No begging, no fake "be the first!"
 * urgency. Deliberately NOT the mascot EmptyState: this sits under a live
 * ask that is itself the content; a dashed fact-box is the design's grammar.
 */
export function ThreadEmpty({ openedAt }: { openedAt: string }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <div className="xidig-codsi-thread-empty">
      <strong className="xidig-codsi-thread-empty__title">{t('plaza.emptyThreadTitle')}</strong>
      <p className="xidig-codsi-thread-empty__body">
        {t('plaza.emptyThreadBody', {
          duration: formatRelativeTime(new Date(openedAt), locale),
        })}
      </p>
    </div>
  );
}
