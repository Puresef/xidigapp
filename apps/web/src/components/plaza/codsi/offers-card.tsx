'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { AuthorRef, PostView } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../../auth/plain-error';

export interface OfferRowView {
  id: string;
  helper: AuthorRef | null;
  conversationId: string | null;
  createdAt: string;
}

/**
 * The asker's private view of standing offers (owner rail, open ask). Not in
 * the 1a–3b frames — those never show an owner-open turn — but without it
 * the accept step (open → in_progress) is unreachable; built in the 2b rail
 * grammar and flagged in the dispatch report for a design pass. Offers stay
 * invisible to everyone else (RLS: asker + offerer only).
 */
export function OffersCard({ postId, offers }: { postId: string; offers: OfferRowView[] }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);

  if (offers.length === 0) return null;

  function accept(offerId: string) {
    if (pending) return;
    void (async () => {
      setPending(offerId);
      setError(null);
      try {
        await apiPost<{ post: PostView }>(`/api/posts/${postId}/ask`, {
          action: 'accept_offer',
          offerId,
        });
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(null);
      }
    })();
  }

  return (
    <div className="xidig-card xidig-codsi-rail-card">
      <h2 className="xidig-codsi-rail-card__title">{t('plaza.offersCardTitle')}</h2>
      {error ? <PlainErrorBanner error={error} /> : null}
      <ul className="xidig-codsi-offers">
        {offers.map((offer) => (
          <li key={offer.id} className="xidig-codsi-offers__row">
            {offer.helper ? (
              <Avatar
                name={offer.helper.display_name}
                handle={offer.helper.handle}
                src={offer.helper.avatar_thumb_url}
                blurhash={offer.helper.avatar_blurhash}
                size={30}
              />
            ) : null}
            <span className="xidig-codsi-strip__text">
              <span className="xidig-codsi-strip__name">
                {offer.helper?.display_name ?? t('state.empty')}
              </span>
              <span className="xidig-codsi-strip__meta">
                {formatRelativeTime(new Date(offer.createdAt), locale)}
                {offer.conversationId ? (
                  <>
                    {' · '}
                    <Link href={`/messages/${offer.conversationId}`}>{t('plaza.helperOpenDm')}</Link>
                  </>
                ) : null}
              </span>
            </span>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending !== null}
              onClick={() => accept(offer.id)}
            >
              {t('plaza.offerAccept')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
