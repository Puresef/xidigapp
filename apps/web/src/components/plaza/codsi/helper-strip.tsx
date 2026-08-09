'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
import type { AuthorRef } from '@/lib/plaza/views';

/**
 * "Waxaa caawinaya …" — the only public artifact of the offer flow (HANDOFF
 * acceptance). System chrome, never member content: cold accent while the
 * help is underway (frames 2a/2b), never trust orange before fulfilment.
 * The asker's variant carries the door back into the offer DM.
 */
export function HelperStrip({
  helper,
  askerName,
  isAsker,
  helpedAt,
  conversationId,
}: {
  helper: AuthorRef;
  /** The acceptance is the ASKER's act — the meta line names them. */
  askerName: string;
  isAsker: boolean;
  helpedAt: string | null;
  conversationId?: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const accepted = helpedAt ? formatRelativeTime(new Date(helpedAt), locale) : null;
  return (
    <div className="xidig-codsi-strip">
      <Avatar name={helper.display_name} handle={helper.handle} src={helper.avatar_thumb_url} blurhash={helper.avatar_blurhash} size={34} />
      <span className="xidig-codsi-strip__text">
        <span className="xidig-codsi-strip__name">
          {isAsker
            ? t('plaza.helperHelpingOwn', { name: helper.display_name })
            : t('plaza.helperHelping', { name: helper.display_name })}
        </span>
        {accepted ? (
          <span className="xidig-codsi-strip__meta">
            {isAsker
              ? t('plaza.helperAcceptedYouAgo', { time: accepted })
              : t('plaza.helperAcceptedAgo', { name: askerName, time: accepted })}
          </span>
        ) : null}
      </span>
      {isAsker && conversationId ? (
        <Link className="xidig-codsi-strip__link" href={`/messages/${conversationId}`}>
          {t('plaza.helperOpenDm')}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The fulfilled helper card (frame 3b rail; stacks under the article on
 * mobile): credit that outlives the thread, plus the Garab action.
 */
export function HelperCard({ helper, garab }: { helper: AuthorRef; garab: ReactNode }) {
  const t = useT();
  return (
    <div className="xidig-card xidig-codsi-rail-card">
      <h2 className="xidig-codsi-rail-card__title">{t('plaza.helperCardTitle')}</h2>
      <Link href={`/u/${helper.handle}`} className="xidig-codsi-helper-link">
        <Avatar name={helper.display_name} handle={helper.handle} src={helper.avatar_thumb_url} blurhash={helper.avatar_blurhash} size={38} />
        <span className="xidig-codsi-strip__text">
          <span className="xidig-codsi-strip__name">
            {t('plaza.helperHelped', { name: helper.display_name })}
          </span>
          {helper.location_city ? (
            <span className="xidig-codsi-strip__meta">{helper.location_city}</span>
          ) : null}
        </span>
      </Link>
      {garab}
    </div>
  );
}
