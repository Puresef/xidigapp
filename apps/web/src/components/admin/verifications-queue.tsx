'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * §14 verifier queue. Each card is an identity/business verification request.
 * Controls PATCH /api/admin/verifications/[id]: schedule ({ bookingUrl }),
 * decide ({ decision, notes? }). "View recording" GETs the access-logged
 * recording endpoint and opens the returned URL in a new tab. The recording_url
 * itself is NEVER in the list payload — it is fetched on demand, and the fetch
 * is logged server-side (§14 accountability).
 */

export interface VerificationItem {
  id: string;
  type: string;
  status: string;
  consentGiven: boolean;
  ageDays: number;
  slaBreached: boolean;
  requester: { displayName: string | null; handle: string | null } | null;
  businessName: string | null;
}

export function VerificationsQueue({ initialItems }: { initialItems: VerificationItem[] }) {
  const t = useT();
  const [items, setItems] = useState<VerificationItem[]>(initialItems);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bookings, setBookings] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>, removeOnSuccess: boolean) {
    setPendingId(id);
    setError(null);
    setNotice(null);
    const snapshot = items;
    if (removeOnSuccess) setItems((current) => current.filter((item) => item.id !== id));
    try {
      await action();
      setNotice(t('admin.verifyDecided'));
    } catch (cause) {
      if (removeOnSuccess) setItems(snapshot);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPendingId(null);
    }
  }

  function schedule(id: string) {
    const bookingUrl = (bookings[id] ?? '').trim();
    if (!bookingUrl) return;
    // Scheduling keeps the request in the queue (status → scheduled), so the
    // card stays; update its status in place.
    void run(
      id,
      async () => {
        await apiPatch(`/api/admin/verifications/${id}`, { bookingUrl });
        setItems((current) =>
          current.map((item) => (item.id === id ? { ...item, status: 'scheduled' } : item)),
        );
      },
      false,
    );
  }

  function decide(id: string, decision: 'approved' | 'declined' | 'more_info') {
    const note = (notes[id] ?? '').trim();
    // approve/decline are terminal → remove; more_info keeps the card in queue.
    void run(
      id,
      async () => {
        await apiPatch(`/api/admin/verifications/${id}`, note ? { decision, notes: note } : { decision });
      },
      decision !== 'more_info',
    );
  }

  async function viewRecording(id: string) {
    setError(null);
    setNotice(null);
    try {
      const data = await apiGet<{ recordingUrl: string }>(`/api/admin/verifications/${id}/recording`);
      window.open(data.recordingUrl, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    }
  }

  if (items.length === 0 && !notice) {
    return <p className="xidig-card__meta">{t('admin.verifyEmpty')}</p>;
  }

  return (
    <div>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}
      <ul className="xidig-card-grid">
        {items.map((item) => (
          <li key={item.id} className="xidig-card">
            <p className="xidig-chip-row">
              <span className="xidig-tag">
                {item.type === 'business'
                  ? t('admin.verifyTypeBusiness')
                  : t('admin.verifyTypeIdentity')}
              </span>
              <span className="xidig-tag">
                {item.status === 'scheduled'
                  ? t('admin.verifyStatusScheduled')
                  : t('admin.verifyStatusPending')}
              </span>
              <span className={item.slaBreached ? 'xidig-tag xidig-tag--danger' : 'xidig-tag'}>
                {item.slaBreached
                  ? t('admin.reportSlaBreached')
                  : t('admin.verifyAgeDays', { days: Math.round(item.ageDays) })}
              </span>
            </p>
            {item.requester ? (
              <p className="xidig-card__meta">
                {t('admin.verifyRequester')}: {item.requester.displayName ?? '—'}
                {item.requester.handle ? ` (@${item.requester.handle})` : ''}
              </p>
            ) : null}
            {item.businessName ? (
              <p className="xidig-card__meta">
                {t('admin.verifyBusinessName')}: {item.businessName}
              </p>
            ) : null}
            <p className="xidig-card__meta">
              <span className={item.consentGiven ? 'xidig-tag xidig-tag--ok' : 'xidig-tag'}>
                {item.consentGiven
                  ? t('admin.verifyConsentGiven')
                  : t('admin.verifyConsentMissing')}
              </span>
            </p>

            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor={`verify-booking-${item.id}`}>
                {t('admin.verifyBookingLabel')}
              </label>
              <input
                id={`verify-booking-${item.id}`}
                className="xidig-field__input"
                type="url"
                inputMode="url"
                value={bookings[item.id] ?? ''}
                onChange={(e) => setBookings((current) => ({ ...current, [item.id]: e.target.value }))}
              />
            </div>
            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor={`verify-note-${item.id}`}>
                {t('admin.verifyNotesLabel')}
              </label>
              <textarea
                id={`verify-note-${item.id}`}
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
                onClick={() => schedule(item.id)}
              >
                {t('admin.verifySchedule')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--primary"
                disabled={pendingId === item.id}
                onClick={() => decide(item.id, 'approved')}
              >
                {t('admin.verifyApprove')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => decide(item.id, 'declined')}
              >
                {t('admin.verifyDecline')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pendingId === item.id}
                onClick={() => decide(item.id, 'more_info')}
              >
                {t('admin.verifyMoreInfo')}
              </button>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                onClick={() => void viewRecording(item.id)}
              >
                {t('admin.verifyViewRecording')}
              </button>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
