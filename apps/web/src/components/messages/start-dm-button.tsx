'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * "Message" entry point on another member's profile (§13 start DM from a
 * contact surface). Opens (or creates) the conversation and routes to it; a
 * §27 dm_blocked error renders inline instead of navigating.
 */
export function StartDmButton({ recipientUserId }: { recipientUserId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const res = await apiPost<{ conversationId: string }>('/api/conversations', {
        recipientUserId,
      });
      router.push(`/messages/${res.conversationId}`);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: t('messages.startError') });
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={pending}
        onClick={() => void start()}
      >
        {t('action.message')}
      </button>
      {error ? <PlainErrorBanner error={error} /> : null}
    </>
  );
}
