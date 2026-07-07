'use client';

import { useId, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import { INTEREST_MESSAGE_MAX } from '@/lib/capital/constants';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';

/**
 * Xidig Venture Fund modal — the FUND-FIRST funnel (§17, compliance-critical).
 * The Maalgeli CTA ALWAYS opens THIS first: standing fund-level intent (POST
 * /api/capital/fund-interest, candidate_id null, one per user) is the primary
 * path; a per-candidate intent is a SECONDARY, opt-in step. The standing
 * securities disclaimer is always shown.
 *
 * Only ever mounted once the region gate has GRANTED (the CTA gates this), so
 * `attested` is passed straight through to the intent-capture calls. v1.0 is
 * intent capture only — no money moves, nothing here is an offer of securities.
 */
export function VentureFundModal({
  open,
  candidateId,
  onClose,
}: {
  open: boolean;
  /** When present, the secondary per-candidate intent path is offered. */
  candidateId?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const fundMsgId = useId();
  const candMsgId = useId();
  const [fundMessage, setFundMessage] = useState('');
  const [candMessage, setCandMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [fundDone, setFundDone] = useState(false);
  const [candDone, setCandDone] = useState(false);

  if (!open) return null;

  function expressFundInterest() {
    if (pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        await apiPost('/api/capital/fund-interest', {
          message: fundMessage.trim() || undefined,
          attested: true,
        });
        setFundDone(true);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  function expressCandidateInterest() {
    if (pending || !candidateId) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        // Phase 7: analytics (interest_expressed)
        await apiPost(`/api/candidates/${candidateId}/interests`, {
          type: 'invest',
          message: candMessage.trim() || undefined,
          attested: true,
        });
        setCandDone(true);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="xidig-modal" role="dialog" aria-modal="true" aria-label={t('capital.fundTitle')}>
      <div className="xidig-modal__panel xidig-capital-fund">
        <h2 className="xidig-modal__title">{t('capital.fundTitle')}</h2>
        <p className="xidig-card__body">{t('capital.fundIntro')}</p>

        {error ? <PlainErrorBanner error={error} /> : null}

        {/* Primary: standing fund-level intent */}
        {fundDone ? (
          <Banner kind="notice">{t('capital.fundInterestRecorded')}</Banner>
        ) : (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor={fundMsgId}>
              {t('capital.fundMessageLabel')}
            </label>
            <textarea
              id={fundMsgId}
              className="xidig-field__input"
              rows={3}
              maxLength={INTEREST_MESSAGE_MAX}
              value={fundMessage}
              onChange={(e) => setFundMessage(e.target.value)}
            />
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              disabled={pending}
              onClick={expressFundInterest}
            >
              {t('capital.fundExpressCta')}
            </button>
          </div>
        )}

        {/* Secondary: per-candidate intent (opt-in) */}
        {candidateId ? (
          candDone ? (
            <Banner kind="notice">{t('capital.candidateInterestRecorded')}</Banner>
          ) : (
            <details className="xidig-capital-fund__secondary">
              <summary>{t('capital.fundSecondaryToggle')}</summary>
              <div className="xidig-field">
                <label className="xidig-field__label" htmlFor={candMsgId}>
                  {t('capital.candidateInterestLabel')}
                </label>
                <textarea
                  id={candMsgId}
                  className="xidig-field__input"
                  rows={3}
                  maxLength={INTEREST_MESSAGE_MAX}
                  value={candMessage}
                  onChange={(e) => setCandMessage(e.target.value)}
                />
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  disabled={pending}
                  onClick={expressCandidateInterest}
                >
                  {t('capital.candidateInterestCta')}
                </button>
              </div>
            </details>
          )
        ) : null}

        <p className="xidig-card__meta xidig-capital-fund__disclaimer">
          {t('capital.securitiesDisclaimer')}
        </p>

        <div className="xidig-modal__actions">
          <button type="button" className="xidig-button xidig-button--secondary" onClick={onClose}>
            {t('action.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
