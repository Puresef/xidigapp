'use client';

import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from './auth/plain-error';
import { Banner } from './banner';

/**
 * Reusable "Report" entry point (§13/§19). A toggle button that opens the §27
 * reason form and submits to the shared reports table (POST /api/reports —
 * requireUser + rate-limited + duplicate-guarded server-side). Extracted from
 * the DM ConversationMenu so newly-reportable surfaces (Candidate, Business
 * listing, comments) use the exact same reason taxonomy, copy, and flow. All
 * strings are existing launch-floor i18n keys — no new copy.
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

/** The reportable non-DM surfaces this control is wired into. */
export type ReportTargetType = 'candidate' | 'listing' | 'comment' | 'post' | 'lab_update' | 'profile';

export function ReportControl({
  targetType,
  targetId,
  targetName,
}: {
  targetType: ReportTargetType;
  targetId: string;
  /** Fills the "Report {name}" heading — a candidate/business name or author. */
  targetName: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);

  async function submit() {
    setError(null);
    try {
      const res = await apiPost<{ message?: string }>('/api/reports', {
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      setOpen(false);
      setNotice(res.message ?? t('messages.reportSubmitted'));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  if (notice) return <Banner kind="notice">{notice}</Banner>;

  const reasonId = `report-reason-${targetId}`;
  const detailsId = `report-details-${targetId}`;

  return (
    <div className="xidig-report-control">
      {error ? <PlainErrorBanner error={error} /> : null}

      {open ? (
        <form
          className="xidig-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="xidig-field__label">{t('messages.reportTitle', { name: targetName })}</p>
          <label className="xidig-field__label" htmlFor={reasonId}>
            {t('messages.reportReasonLabel')}
          </label>
          <select
            id={reasonId}
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
          <label className="xidig-field__label" htmlFor={detailsId}>
            {t('messages.reportDetailsLabel')}
          </label>
          <textarea
            id={detailsId}
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
              onClick={() => setOpen(false)}
            >
              {t('action.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          onClick={() => setOpen(true)}
        >
          {t('action.report')}
        </button>
      )}
    </div>
  );
}
