'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Candidate vote — PAUSED (Xidig Plus doctrine, owner 12 Sep: "pause, don't
 * broaden"). Replaces the interactive vote panel.
 *
 * The vote used to be gated on the paid tier. Xidig Plus must not decide voting
 * eligibility, and no non-paid eligibility model is approved yet, so every
 * signed-in member sees the same neutral state:
 *   - "under review", never "requires Xidig Plus";
 *   - no ballot buttons and no upgrade prompt;
 *   - no tally. Live counts are hidden while the vote is paused, and the page
 *     receives none (lib/capital/views.ts projects no tally).
 *
 * One control remains: a member who voted BEFORE the pause can withdraw their
 * own ballot (data control, the A2 retraction precedent). The server removes
 * only the caller's own row and never returns a count.
 */
export function CandidateVotePaused({
  candidateId,
  hasBallot = false,
}: {
  candidateId: string;
  /** The viewer holds a ballot cast before the pause (own-row read). */
  hasBallot?: boolean;
}) {
  const t = useT();
  const [ballot, setBallot] = useState(hasBallot);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  function withdraw() {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        await apiDelete(`/api/candidates/${candidateId}/vote`);
        setBallot(false);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <section className="xidig-section xidig-capital-vote" aria-label={t('capital.voteHeading')}>
      <h2 className="xidig-section__title">{t('capital.voteHeading')}</h2>
      <p className="xidig-card__meta">{t('capital.voteSignalNote')}</p>
      <p className="xidig-card__meta">{t('capital.voteEligibilityNote')}</p>
      {error ? <PlainErrorBanner error={error} /> : null}
      {ballot ? (
        <>
          <p className="xidig-card__meta">{t('capital.voteKeptNote')}</p>
          <p>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending}
              onClick={withdraw}
            >
              {t('capital.voteRetract')}
            </button>
          </p>
        </>
      ) : null}
    </section>
  );
}
