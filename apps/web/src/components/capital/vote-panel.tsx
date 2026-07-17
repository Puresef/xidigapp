'use client';

import { useEffect, useState } from 'react';

import type { Enums } from '@xidig/db';
import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
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
  // Ceremony trigger (spec §4): counts fresh casts THIS session — each success
  // remounts the mark (key) so the one-shot fold replays. Never on load, never
  // on retract.
  const [celebrated, setCelebrated] = useState(0);

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
        setCelebrated((n) => n + 1);
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
        setCelebrated(0);
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

      {/* Split bar (brand-rethink adoption): the approve share of REAL cast
          ballots. Rendered only when votes exist — never a zero-faked bar.
          An eligible-voter denominator ("N of M") is deliberately absent:
          no member-side query exposes M, and a made-up denominator would
          violate the every-number-is-real rule. Decorative (aria-hidden) —
          the counts line below carries the numbers for everyone. */}
      {tally.total > 0 ? (
        <div className="xidig-vote-split" aria-hidden="true">
          <span
            className="xidig-vote-split__approve"
            style={{ width: `${Math.round((tally.approve / tally.total) * 100)}%` }}
          />
        </div>
      ) : null}
      <p className="xidig-card__meta">
        {celebrated > 0 ? (
          <AnimatedMark
            key={celebrated}
            mode="ceremony"
            size={22}
            className="xidig-celebrate-inline"
          />
        ) : null}
        {t('capital.voteTally', {
          approve: tally.approve,
          reject: tally.reject,
          total: tally.total,
        })}
      </p>

      {/* Ballot option cards (brand-rethink adoption): presentation only —
          the same immediate-cast buttons, now with a radio-style indicator,
          bold label, and signal-language description. aria-pressed keeps the
          toggle semantics screen readers already had. */}
      <div className="xidig-capital-vote__actions xidig-vote-cards">
        <button
          type="button"
          className={`xidig-vote-card${myVote === 'approve' ? ' xidig-vote-card--selected' : ''}`}
          disabled={pending}
          aria-pressed={myVote === 'approve'}
          onClick={() => cast('approve')}
        >
          <span className="xidig-vote-card__radio" aria-hidden="true" />
          <span className="xidig-vote-card__text">
            <span className="xidig-vote-card__label">{t('capital.voteApprove')}</span>
            <span className="xidig-vote-card__desc">{t('capital.voteApproveDesc')}</span>
          </span>
        </button>
        <button
          type="button"
          className={`xidig-vote-card${myVote === 'reject' ? ' xidig-vote-card--selected' : ''}`}
          disabled={pending}
          aria-pressed={myVote === 'reject'}
          onClick={() => cast('reject')}
        >
          <span className="xidig-vote-card__radio" aria-hidden="true" />
          <span className="xidig-vote-card__text">
            <span className="xidig-vote-card__label">{t('capital.voteReject')}</span>
            <span className="xidig-vote-card__desc">{t('capital.voteRejectDesc')}</span>
          </span>
        </button>
      </div>
      {myVote !== null ? (
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={retract}
          >
            {t('capital.voteRetract')}
          </button>
        </p>
      ) : null}
    </section>
  );
}
