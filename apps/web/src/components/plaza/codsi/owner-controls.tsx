'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { PostView } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../../auth/plain-error';

/**
 * "Adigu waad leedahay codsigan" (frame 2b): the lifecycle control lives here
 * and nowhere else. Mark-solved is primary (from open or in_progress);
 * reopen only walks back an in-progress ask; fulfilled is terminal so the
 * card yields to the celebration. The API refuses non-askers regardless —
 * this is the UI half of "RLS + UI".
 */
export function OwnerControls({
  postId,
  askStatus,
  isAsker,
}: {
  postId: string;
  askStatus: 'open' | 'in_progress' | 'fulfilled' | 'answered' | 'closed';
  isAsker: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (!isAsker) return null;
  if (askStatus !== 'open' && askStatus !== 'in_progress') return null;

  function transition(action: 'fulfill' | 'reopen') {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        await apiPost<{ post: PostView }>(`/api/posts/${postId}/ask`, { action });
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="xidig-card xidig-codsi-rail-card">
      <h2 className="xidig-codsi-rail-card__title">{t('plaza.ownerCardTitle')}</h2>
      {error ? <PlainErrorBanner error={error} /> : null}
      <button
        type="button"
        className="xidig-button xidig-button--primary xidig-codsi-rail-card__action"
        disabled={pending}
        onClick={() => transition('fulfill')}
      >
        {t('plaza.markFulfilled')}
      </button>
      {askStatus === 'in_progress' ? (
        <button
          type="button"
          className="xidig-button xidig-button--secondary xidig-codsi-rail-card__action"
          disabled={pending}
          onClick={() => transition('reopen')}
        >
          {t('plaza.reopenAsk')}
        </button>
      ) : null}
      <p className="xidig-codsi-rail-card__note">{t('plaza.ownerOnlyNote')}</p>
    </div>
  );
}
