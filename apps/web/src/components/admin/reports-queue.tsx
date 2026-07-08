'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Phase 6 member-reports queue (§19/§27). Each card is a report a member filed;
 * a mod claims it, then decides. Decisions PATCH /api/admin/reports/[id] with a
 * decision shape ({ action, resolution?, reason? }); claim/release use { claim }.
 * On a successful decision the card leaves the list optimistically. This is the
 * member-reports queue — distinct from the Phase 2 AI-escalation queue.
 */

export interface ReportItem {
  id: string;
  reason: string;
  targetType: string;
  status: string;
  assigned: boolean;
  ageHours: number;
  slaBreached: boolean;
  reporter: { displayName: string | null; handle: string | null } | null;
  snapshotExcerpt: string | null;
  createdAt: string;
}

type Decision = 'no_violation' | 'dismiss' | 'hide_content' | 'remove_content' | 'warn_user' | 'suspend_user';

export function ReportsQueue({ initialItems }: { initialItems: ReportItem[] }) {
  const t = useT();
  const [items, setItems] = useState<ReportItem[]>(initialItems);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function claim(id: string) {
    setPendingId(id);
    setError(null);
    setNotice(null);
    try {
      await apiPatch(`/api/admin/reports/${id}`, { claim: true });
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, assigned: true, status: 'in_review' } : item)),
      );
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPendingId(null);
    }
  }

  async function decide(id: string, action: Decision) {
    setPendingId(id);
    setError(null);
    setNotice(null);
    const snapshot = items;
    const note = (notes[id] ?? '').trim();
    const resolution = (resolutions[id] ?? '').trim();
    // Optimistic removal — a decision is terminal, so the card leaves the queue.
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await apiPatch(`/api/admin/reports/${id}`, {
        action,
        ...(note ? { reason: note } : {}),
        ...(resolution ? { resolution } : {}),
      });
      setNotice(t('admin.reportDecided'));
    } catch (cause) {
      setItems(snapshot);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPendingId(null);
    }
  }

  function reasonLabel(reason: string): string {
    switch (reason) {
      case 'spam':
        return t('messages.reportReasonSpam');
      case 'harassment':
        return t('messages.reportReasonHarassment');
      case 'impersonation':
        return t('messages.reportReasonImpersonation');
      case 'fraud_or_scam':
        return t('messages.reportReasonFraud');
      case 'inappropriate_content':
        return t('messages.reportReasonInappropriate');
      case 'misinformation':
        return t('messages.reportReasonMisinfo');
      default:
        return t('messages.reportReasonOther');
    }
  }

  if (items.length === 0 && !notice) {
    return <p className="xidig-card__meta">{t('admin.reportsEmpty')}</p>;
  }

  return (
    <div>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}
      <ul className="xidig-card-grid">
        {items.map((item) => (
          <li key={item.id} className="xidig-card">
            <p className="xidig-chip-row">
              <span className="xidig-tag">{reasonLabel(item.reason)}</span>
              <span className="xidig-tag">{item.targetType}</span>
              <span className={item.slaBreached ? 'xidig-tag xidig-tag--danger' : 'xidig-tag'}>
                {item.slaBreached
                  ? t('admin.reportSlaBreached')
                  : t('admin.reportAgeHours', { hours: Math.round(item.ageHours) })}
              </span>
            </p>
            {item.reporter ? (
              <p className="xidig-card__meta">
                {t('admin.reportReporter')}: {item.reporter.displayName ?? '—'}
                {item.reporter.handle ? ` (@${item.reporter.handle})` : ''}
              </p>
            ) : null}
            {item.snapshotExcerpt ? (
              <>
                <p className="xidig-card__meta">{t('admin.reportSnapshot')}:</p>
                <p className="xidig-card__body">{item.snapshotExcerpt}</p>
              </>
            ) : null}

            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor={`report-note-${item.id}`}>
                {t('admin.reportNoteLabel')}
              </label>
              <textarea
                id={`report-note-${item.id}`}
                className="xidig-field__input"
                rows={2}
                maxLength={2000}
                value={notes[item.id] ?? ''}
                onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))}
              />
            </div>
            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor={`report-resolution-${item.id}`}>
                {t('admin.reportResolutionLabel')}
              </label>
              <textarea
                id={`report-resolution-${item.id}`}
                className="xidig-field__input"
                rows={2}
                maxLength={2000}
                value={resolutions[item.id] ?? ''}
                onChange={(e) =>
                  setResolutions((current) => ({ ...current, [item.id]: e.target.value }))
                }
              />
            </div>

            <p className="xidig-profile__actions">
              {!item.assigned ? (
                <button
                  type="button"
                  className="xidig-button xidig-button--primary"
                  disabled={pendingId === item.id}
                  onClick={() => void claim(item.id)}
                >
                  {t('admin.reportClaim')}
                </button>
              ) : null}
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'no_violation')}
              >
                {t('admin.reportNoViolation')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'dismiss')}
              >
                {t('admin.reportDismiss')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'hide_content')}
              >
                {t('admin.reportHide')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'remove_content')}
              >
                {t('admin.reportRemove')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'warn_user')}
              >
                {t('admin.reportWarn')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'suspend_user')}
              >
                {t('admin.reportSuspend')}
              </button>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
