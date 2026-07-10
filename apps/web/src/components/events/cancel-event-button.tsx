'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/** Host-only cancel (soft — the page stays up with a cancelled banner). */
export function CancelEventButton({ slug }: { slug: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  async function cancel() {
    if (!window.confirm(t('events.cancelConfirm'))) return;
    setPending(true);
    setError(null);
    try {
      await apiDelete(`/api/events/${slug}`);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="xidig-section">
      {error ? <PlainErrorBanner error={error} /> : null}
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={pending}
        onClick={() => void cancel()}
      >
        {t('events.cancelEvent')}
      </button>
    </div>
  );
}
