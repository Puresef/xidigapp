'use client';

import { useEffect, useState } from 'react';

import type { Enums } from '@xidig/db';
import { useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { ApiRequestError, apiDelete, apiPost } from '@/lib/api-client';
import type { VoteTally } from '@/lib/capital/views';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Supporter governance vote panel (§12/§17). Rendered ONLY when the viewer holds
 * the vote_candidate capability AND the 7-day window is open (the page decides
 * both — this component just casts/retracts and shows the running tally). The
 * vote is a non-binding SIGNAL; v1.0 attaches no execution flow. Ballots are
 * private — only aggregate counts are ever shown.
 */

type VoteChoice = Enums<'vote_choice'>;

interface VoteResponse {
  tally: VoteTally;
  // Matches the vote route envelope: apiOk({ tally, myVote }).
  myVote: VoteChoice | null;
}

export function VotePanel({
  candidateId,
  initialTally,
  initialVote,
}: {
  candidateId: string;
  initialTally: VoteTally;
  initialVote: VoteChoice | null;
}) {
  const t = useT();
  const [tally, setTally] = useState<VoteTally>(initialTally);
  const [myVote, setMyVote] = useState<VoteChoice | null>(initialVote);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  // §23 governance_log_viewed — fire once per mount of the governance surface.
  useEffect(() => {
    trackClient('governance_log_viewed', {});
  }, []);

  function cast(vote: VoteChoice) {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        const res = await apiPost<VoteResponse>(`/api/candidates/${candidateId}/vote`, { vote });
        setTally(res.tally);
        setMyVote(res.myVote);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  function retract() {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        const res = await apiDelete<VoteResponse>(`/api/candidates/${candidateId}/vote`);
        setTally(res.tally);
        setMyVote(null);
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
      {error ? <PlainErrorBanner error={error} /> : null}

      <p className="xidig-card__body">
        {t('capital.voteTally', {
          approve: tally.approve,
          reject: tally.reject,
          total: tally.total,
        })}
      </p>

      <div className="xidig-capital-vote__actions">
        <button
          type="button"
          className={`xidig-button ${myVote === 'approve' ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={pending}
          aria-pressed={myVote === 'approve'}
          onClick={() => cast('approve')}
        >
          {t('capital.voteApprove')}
        </button>
        <button
          type="button"
          className={`xidig-button ${myVote === 'reject' ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={pending}
          aria-pressed={myVote === 'reject'}
          onClick={() => cast('reject')}
        >
          {t('capital.voteReject')}
        </button>
        {myVote !== null ? (
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={retract}
          >
            {t('capital.voteRetract')}
          </button>
        ) : null}
      </div>
    </section>
  );
}
