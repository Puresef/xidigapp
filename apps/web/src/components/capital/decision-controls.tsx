'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { Enums } from '@xidig/db';
import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import { CANDIDATE_STATUS_REASON_MAX } from '@/lib/capital/constants';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Reviewer decision controls (§17). Moves a candidate through the reviewer
 * status set (in_review / approved / parked / declined) with an optional visible
 * reason. Reviewer-only (mod/admin, recusal enforced server-side → the API
 * returns reviewer_conflict, rendered verbatim). On success the page refreshes
 * so the status badge + timeline catch up.
 */

type DecisionStatus = Extract<
  Enums<'candidate_status'>,
  'in_review' | 'approved' | 'parked' | 'declined'
>;

const DECISIONS: { status: DecisionStatus; key: MessageKey }[] = [
  { status: 'in_review', key: 'capital.decisionInReview' },
  { status: 'approved', key: 'capital.decisionApprove' },
  { status: 'parked', key: 'capital.decisionPark' },
  { status: 'declined', key: 'capital.decisionDecline' },
];

export function DecisionControls({ candidateId }: { candidateId: string }) {
  const t = useT();
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<DecisionStatus | null>(null);
  const [error, setError] = useState<PlainError | null>(null);

  function decide(status: DecisionStatus) {
    if (pending) return;
    void (async () => {
      setPending(status);
      setError(null);
      try {
        await apiPost(`/api/candidates/${candidateId}/decision`, {
          status,
          statusReason: reason.trim() || undefined,
        });
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(null);
      }
    })();
  }

  return (
    <section className="xidig-section xidig-capital-decision">
      <h2 className="xidig-section__title">{t('capital.decisionHeading')}</h2>
      {error ? <PlainErrorBanner error={error} /> : null}

      <div className="xidig-field">
        <label className="xidig-field__label">{t('capital.decisionReasonLabel')}</label>
        <textarea
          className="xidig-field__input"
          rows={2}
          maxLength={CANDIDATE_STATUS_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="xidig-field__hint">{t('capital.decisionReasonHint')}</p>
      </div>

      <div className="xidig-capital-decision__actions">
        {DECISIONS.map((d) => (
          <button
            key={d.status}
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending !== null}
            onClick={() => decide(d.status)}
          >
            {t(d.key)}
          </button>
        ))}
      </div>
    </section>
  );
}
