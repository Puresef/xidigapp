'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { PostView } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';

/**
 * Ask lifecycle controls on /p/[id] (§15). Asker-only: close the Ask when
 * it's sorted. Crediting an answer lives on each comment (CommentThread) —
 * this component only owns the close action. All transition errors carry
 * §27 copy from the API and render verbatim.
 */
export function AskControls({
  postId,
  isAsker,
  askStatus,
}: {
  postId: string;
  isAsker: boolean;
  askStatus: 'open' | 'answered' | 'closed';
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [closedNotice, setClosedNotice] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (!isAsker) return null;
  // Keep the confirmation visible after router.refresh() flips the prop.
  if (closedNotice) return <Banner kind="notice">{t('plaza.askClosedNotice')}</Banner>;
  if (askStatus === 'closed') return null;

  function close() {
    void (async () => {
      setPending(true);
      setError(null);
      try {
        await apiPost<{ post: PostView }>(`/api/posts/${postId}/ask`, { action: 'close' });
        setClosedNotice(true);
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
    <div className="xidig-section">
      {error ? <PlainErrorBanner error={error} /> : null}
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={pending}
        onClick={close}
      >
        {t('plaza.closeAsk')}
      </button>
    </div>
  );
}
