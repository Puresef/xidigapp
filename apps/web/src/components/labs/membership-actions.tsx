'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { ViewerRelation } from '@/lib/labs/views';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';

/**
 * Join / request / leave + pin controls on a Space page. The affordance shown
 * depends on the viewer's relationship and the Space's join_mode. All actions
 * hit the API (never Supabase directly) and refresh the RSC on success.
 */
export function MembershipActions({
  labId,
  viewerRelation,
  joinMode,
  isPinned,
}: {
  labId: string;
  viewerRelation: ViewerRelation;
  joinMode: 'open' | 'request' | 'invite';
  isPinned: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [pinned, setPinned] = useState(isPinned);

  async function run(fn: () => Promise<{ notice?: string } | void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (result && 'notice' in result && result.notice) setNotice(result.notice);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  const isMember = ['lead', 'core', 'member', 'observer'].includes(viewerRelation);

  return (
    <div className="xidig-actions">
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}

      {viewerRelation === 'none' && joinMode !== 'invite' ? (
        <button
          type="button"
          className="xidig-button xidig-button--primary"
          disabled={pending}
          onClick={() =>
            void run(async () => {
              const res = await apiPost<{ notice?: string; message?: string }>(
                `/api/labs/${labId}/members`,
                { action: 'join' },
              );
              return res.message ? { notice: res.message } : undefined;
            })
          }
        >
          {joinMode === 'open' ? t('lab.actionJoin') : t('lab.actionRequestJoin')}
        </button>
      ) : null}

      {viewerRelation === 'requested' ? (
        <button type="button" className="xidig-button xidig-button--secondary" disabled>
          {t('lab.actionRequested')}
        </button>
      ) : null}

      {isMember && viewerRelation !== 'lead' ? (
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending}
          onClick={() =>
            void run(() => apiPost(`/api/labs/${labId}/members`, { action: 'leave' }))
          }
        >
          {t('lab.actionLeave')}
        </button>
      ) : null}

      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={pending}
        onClick={() =>
          void run(async () => {
            if (pinned) {
              await apiDelete(`/api/labs/${labId}/pin`);
              setPinned(false);
            } else {
              await apiPost(`/api/labs/${labId}/pin`);
              setPinned(true);
            }
          })
        }
      >
        {pinned ? t('lab.actionUnpin') : t('lab.actionPin')}
      </button>
    </div>
  );
}
