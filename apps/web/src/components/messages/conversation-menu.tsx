'use client';

import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';

/**
 * Per-conversation Block + Report menu (§13 "block + report inside DMs";
 * §27 copy). Block calls the API (which also halts the thread); report submits
 * to the shared reports table and shows the §27 "thanks for the report"
 * notice. This is the DM entry point only — the Phase 6 mod queue is separate.
 */

const REASONS: ReadonlyArray<{ value: string; labelKey: MessageKey }> = [
  { value: 'spam', labelKey: 'messages.reportReasonSpam' },
  { value: 'harassment', labelKey: 'messages.reportReasonHarassment' },
  { value: 'impersonation', labelKey: 'messages.reportReasonImpersonation' },
  { value: 'fraud_or_scam', labelKey: 'messages.reportReasonFraud' },
  { value: 'inappropriate_content', labelKey: 'messages.reportReasonInappropriate' },
  { value: 'misinformation', labelKey: 'messages.reportReasonMisinfo' },
  { value: 'other', labelKey: 'messages.reportReasonOther' },
];

export function ConversationMenu({
  targetUserId,
  targetName,
  onBlocked,
}: {
  targetUserId: string;
  targetName: string;
  onBlocked: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);

  async function block() {
    if (!window.confirm(t('messages.blockConfirm', { name: targetName }))) return;
    setError(null);
    try {
      await apiPut(`/api/blocks/${targetUserId}`);
      setOpen(false);
      onBlocked();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  async function submitReport() {
    setError(null);
    try {
      const res = await apiPost<{ message?: string }>('/api/reports', {
        targetType: 'user',
        targetId: targetUserId,
        reason,
        details: details.trim() || undefined,
      });
      setReporting(false);
      setOpen(false);
      setNotice(res.message ?? t('messages.reportSubmitted'));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  if (notice) return <Banner kind="notice">{notice}</Banner>;

  return (
    <div className="xidig-dm-menu">
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('messages.optionsLabel')}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>

      {open ? (
        <div className="xidig-dm-menu__panel" role="menu">
          {error ? <PlainErrorBanner error={error} /> : null}

          {reporting ? (
            <form
              className="xidig-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submitReport();
              }}
            >
              <p className="xidig-field__label">{t('messages.reportTitle', { name: targetName })}</p>
              <label className="xidig-field__label" htmlFor="dm-report-reason">
                {t('messages.reportReasonLabel')}
              </label>
              <select
                id="dm-report-reason"
                className="xidig-field__input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.labelKey)}
                  </option>
                ))}
              </select>
              <label className="xidig-field__label" htmlFor="dm-report-details">
                {t('messages.reportDetailsLabel')}
              </label>
              <textarea
                id="dm-report-details"
                className="xidig-field__input"
                rows={2}
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
              <div className="xidig-profile__actions">
                <button type="submit" className="xidig-button xidig-button--primary">
                  {t('action.report')}
                </button>
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  onClick={() => setReporting(false)}
                >
                  {t('action.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <ul className="xidig-dm-menu__list">
              <li>
                <button type="button" className="xidig-dm-menu__item" onClick={() => void block()}>
                  {t('action.block')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="xidig-dm-menu__item"
                  onClick={() => setReporting(true)}
                >
                  {t('action.report')}
                </button>
              </li>
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
