'use client';

import { type FormEvent, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * "Claim this listing" (§18/§27) for unclaimed (seeded/imported) listings.
 * Optional evidence goes to the mod review queue (PATCH /api/claims/[id],
 * Phase 1 API); approval transfers ownership server-side.
 */
export function ClaimListing({
  listingId,
  alreadyPending,
}: {
  listingId: string;
  alreadyPending: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [submitted, setSubmitted] = useState(alreadyPending);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (submitted) {
    return <Banner kind="notice">{t('suuq.claimSubmitted')}</Banner>;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void (async () => {
      setPending(true);
      setError(null);
      try {
        const trimmed = evidence.trim();
        await apiPost(
          `/api/listings/${listingId}/claims`,
          trimmed ? { evidence: trimmed } : {},
        );
        setSubmitted(true);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  if (!open) {
    return (
      <div>
        {error ? <PlainErrorBanner error={error} /> : null}
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          onClick={() => setOpen(true)}
        >
          {t('suuq.claimListing')}
        </button>
      </div>
    );
  }

  return (
    <form className="xidig-form" onSubmit={onSubmit}>
      {error ? <PlainErrorBanner error={error} /> : null}
      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="claim-evidence">
          {t('suuq.claimEvidenceLabel')}
        </label>
        <textarea
          id="claim-evidence"
          className="xidig-field__input"
          rows={3}
          maxLength={1000}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
      </div>
      <div className="xidig-profile__actions">
        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {t('suuq.claimListing')}
        </button>
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          onClick={() => setOpen(false)}
        >
          {t('action.cancel')}
        </button>
      </div>
    </form>
  );
}
