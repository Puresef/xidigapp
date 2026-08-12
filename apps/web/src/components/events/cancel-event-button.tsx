'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { Dialog } from '@/components/dialog';
import { ApiRequestError, apiDelete } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Host-only cancel (soft — the record stays up, dimmed, with the e6 notice).
 * Cancelling is irreversible, so it confirms through the house Dialog
 * (ruling 18; owner-controls precedent), never window.confirm. The page
 * withholds the trigger once the event has ended — the API 409s event_ended
 * and a finished record should never offer the verb at all.
 */
export function CancelEventButton({ slug }: { slug: string }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      await apiDelete(`/api/events/${slug}`);
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="xidig-event-detail__cancel">
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {t('events.cancelEvent')}
      </button>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('events.cancelEvent')}
        presentation="modal"
      >
        <div className="xidig-form">
          {/* Dialog renders via a portal — an error banner outside these
              children would sit behind the modal overlay, invisible. */}
          {error ? <PlainErrorBanner error={error} /> : null}
          <p className="xidig-card__body">{t('events.cancelConfirm')}</p>
          <div className="xidig-profile__actions">
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              disabled={pending}
              onClick={() => void cancel()}
            >
              {t('events.cancelEvent')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {t('action.cancel')}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
