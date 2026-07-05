'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Follow/unfollow toggle (§13). PUT/DELETE /api/follows/user/{id} are both
 * idempotent, so optimistic-then-reconcile is safe; router.refresh() re-syncs
 * the server-rendered follower count after a change.
 */
export function FollowButton({
  targetUserId,
  initialFollowing,
}: {
  targetUserId: string;
  initialFollowing: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      if (following) {
        await apiDelete<{ following: boolean }>(`/api/follows/user/${targetUserId}`);
        setFollowing(false);
      } else {
        await apiPut<{ following: boolean }>(`/api/follows/user/${targetUserId}`);
        setFollowing(true);
      }
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="xidig-follow">
      <button
        type="button"
        className={`xidig-button ${following ? 'xidig-button--secondary' : 'xidig-button--primary'}`}
        disabled={pending}
        aria-pressed={following}
        onClick={() => void toggle()}
        title={following ? t('action.unfollow') : t('action.follow')}
      >
        {following ? t('action.following') : t('action.follow')}
      </button>
      {error ? <PlainErrorBanner error={error} /> : null}
    </div>
  );
}
