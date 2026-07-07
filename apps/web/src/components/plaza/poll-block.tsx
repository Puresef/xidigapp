'use client';

import { useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { PollView } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Poll voting + results (Seq 14: ballots are anonymous — only counts ever
 * reach the client, via poll_results()). Results stay hidden until the
 * viewer votes or the poll closes; while open, a voter can recast by
 * clicking another option (upsert server-side). The author can close early.
 */
export function PollBlock({
  postId,
  poll: initialPoll,
  pollStatus,
  pollClosesAt,
  isAuthor,
}: {
  postId: string;
  poll: PollView;
  pollStatus: 'open' | 'closed';
  pollClosesAt: string | null;
  isAuthor: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [poll, setPoll] = useState<PollView>(initialPoll);
  const [status, setStatus] = useState<'open' | 'closed'>(pollStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const hasVoted = poll.myOptionId !== null;
  const showResults = hasVoted || status === 'closed';

  function fail(cause: unknown) {
    if (cause instanceof ApiRequestError) setError(cause.plain);
    else setError({ code: 'server_error', message: '' });
  }

  async function vote(optionId: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await apiPost<{ poll: PollView }>(`/api/posts/${postId}/votes`, { optionId });
      setPoll(result.poll);
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }

  async function closePoll() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await apiPost(`/api/posts/${postId}/poll`);
      setStatus('closed');
    } catch (cause) {
      fail(cause);
    } finally {
      setPending(false);
    }
  }

  function percent(votes: number): number {
    return poll.totalVotes > 0 ? Math.round((votes / poll.totalVotes) * 100) : 0;
  }

  return (
    <div className="xidig-poll">
      {error ? <PlainErrorBanner error={error} /> : null}
      {poll.options.map((option) => {
        const isMine = poll.myOptionId === option.id;
        const optionClass = `xidig-poll__option${isMine ? ' xidig-poll__option--mine' : ''}`;
        const results = (
          <>
            <div className="xidig-poll__labels">
              <span>
                {option.label}{' '}
                {isMine ? <span className="xidig-tag">{t('plaza.yourVote')}</span> : null}
              </span>
              <span>{t('plaza.votesCount', { count: option.votes })}</span>
            </div>
            <div className="xidig-poll__bar">
              <div className="xidig-poll__fill" style={{ width: `${percent(option.votes)}%` }} />
            </div>
          </>
        );

        if (status === 'open') {
          return (
            <button
              key={option.id}
              type="button"
              className={optionClass}
              aria-pressed={isMine}
              disabled={pending}
              onClick={() => void vote(option.id)}
            >
              {showResults ? results : <span className="xidig-poll__labels">{option.label}</span>}
            </button>
          );
        }
        return (
          <div key={option.id} className={optionClass}>
            {results}
          </div>
        );
      })}
      {hasVoted && status === 'open' ? (
        <p className="xidig-card__meta">{t('plaza.changeVote')}</p>
      ) : null}
      <p className="xidig-card__meta">
        {t('plaza.votesCount', { count: poll.totalVotes })}
        {status === 'closed' ? <> · {t('plaza.pollClosed')}</> : null}
        {status === 'open' && pollClosesAt ? (
          <>
            {' · '}
            {t('plaza.pollClosesIn', {
              when: formatRelativeTime(new Date(pollClosesAt), locale),
            })}
          </>
        ) : null}
      </p>
      {isAuthor && status === 'open' ? (
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void closePoll()}
          >
            {t('plaza.closePoll')}
          </button>
        </p>
      ) : null}
    </div>
  );
}
