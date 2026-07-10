'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * RSVP controls (extras item 8, locked): going/interested only — absence is
 * "no". The show-publicly checkbox is the member's opt-in to appear by name
 * to other members (default OFF — attendance is sensitive). Soft capacity:
 * the server 409s 'going' when full; 'interested' keeps working.
 */
export function RsvpButtons({
  slug,
  rsvp,
  isFull,
}: {
  slug: string;
  rsvp: { status: 'going' | 'interested'; showPublicly: boolean } | null;
  isFull: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [showPublicly, setShowPublicly] = useState(rsvp?.showPublicly ?? false);

  async function set(status: 'going' | 'interested', show: boolean) {
    setPending(true);
    setError(null);
    try {
      await apiPut(`/api/events/${slug}/rsvp`, { status, showPublicly: show });
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    try {
      await apiDelete(`/api/events/${slug}/rsvp`);
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
      {isFull && rsvp?.status !== 'going' ? (
        <p className="xidig-banner xidig-banner--notice">{t('events.fullLabel')}</p>
      ) : null}
      <div className="xidig-profile__actions">
        <button
          type="button"
          className={`xidig-button ${rsvp?.status === 'going' ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={pending || (isFull && rsvp?.status !== 'going')}
          onClick={() => void set('going', showPublicly)}
        >
          {t('events.rsvpGoing')}
        </button>
        <button
          type="button"
          className={`xidig-button ${rsvp?.status === 'interested' ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={pending}
          onClick={() => void set('interested', showPublicly)}
        >
          {t('events.rsvpInterested')}
        </button>
        {rsvp ? (
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void remove()}
          >
            {t('events.rsvpRemove')}
          </button>
        ) : null}
      </div>
      <label className="xidig-field__label">
        <input
          type="checkbox"
          checked={showPublicly}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setShowPublicly(next);
            // Persist immediately when an RSVP already exists.
            if (rsvp) void set(rsvp.status, next);
          }}
        />{' '}
        {t('events.showPubliclyLabel')}
      </label>
    </div>
  );
}
