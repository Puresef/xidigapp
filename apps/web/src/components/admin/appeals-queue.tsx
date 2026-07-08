'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Phase 6 appeals review queue (§19 "second mod"). A reviewer upholds or
 * overturns an appeal via PATCH /api/admin/appeals/[id] with { outcome,
 * decisionNotes? }. Appeals of the viewer's OWN action are already filtered out
 * server-side (recusal). A decided appeal leaves the list optimistically.
 */

export interface AppealItem {
  id: string;
  status: string;
  body: string;
  ageHours: number;
  slaBreached: boolean;
  appellant: { displayName: string | null; handle: string | null } | null;
  action: { action: string; targetType: string; reason: string | null } | null;
}

export function AppealsQueue({ initialItems }: { initialItems: AppealItem[] }) {
  const t = useT();
  const [items, setItems] = useState<AppealItem[]>(initialItems);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function decide(id: string, outcome: 'upheld' | 'overturned') {
    setPendingId(id);
    setError(null);
    setNotice(null);
    const snapshot = items;
    const note = (notes[id] ?? '').trim();
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await apiPatch(`/api/admin/appeals/${id}`, note ? { outcome, decisionNotes: note } : { outcome });
      setNotice(t('admin.appealDecided'));
    } catch (cause) {
      setItems(snapshot);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0 && !notice) {
    return <p className="xidig-card__meta">{t('admin.appealsEmpty')}</p>;
  }

  return (
    <div>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}
      <ul className="xidig-card-grid">
        {items.map((item) => (
          <li key={item.id} className="xidig-card">
            <p className="xidig-chip-row">
              {item.action ? <span className="xidig-tag">{item.action.action}</span> : null}
              <span className={item.slaBreached ? 'xidig-tag xidig-tag--danger' : 'xidig-tag'}>
                {item.slaBreached
                  ? t('admin.reportSlaBreached')
                  : t('admin.reportAgeHours', { hours: Math.round(item.ageHours) })}
              </span>
            </p>
            {item.appellant ? (
              <p className="xidig-card__meta">
                {t('admin.appealAppellant')}: {item.appellant.displayName ?? '—'}
                {item.appellant.handle ? ` (@${item.appellant.handle})` : ''}
              </p>
            ) : null}
            {item.action ? (
              <p className="xidig-card__meta">
                {t('admin.appealOriginalAction')}: {item.action.action} ({item.action.targetType})
              </p>
            ) : null}
            {item.action?.reason ? (
              <p className="xidig-card__meta">
                {t('admin.appealModNote')}: {item.action.reason}
              </p>
            ) : null}
            <p className="xidig-card__meta">{t('admin.appealBody')}:</p>
            <p className="xidig-card__body">{item.body}</p>

            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor={`appeal-note-${item.id}`}>
                {t('admin.appealNotesLabel')}
              </label>
              <textarea
                id={`appeal-note-${item.id}`}
                className="xidig-field__input"
                rows={2}
                maxLength={2000}
                value={notes[item.id] ?? ''}
                onChange={(e) => setNotes((current) => ({ ...current, [item.id]: e.target.value }))}
              />
            </div>

            <p className="xidig-profile__actions">
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'upheld')}
              >
                {t('admin.appealUphold')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--primary"
                disabled={pendingId === item.id}
                onClick={() => void decide(item.id, 'overturned')}
              >
                {t('admin.appealOverturn')}
              </button>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
