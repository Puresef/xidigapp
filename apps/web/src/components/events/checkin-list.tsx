'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { EventCheckinRow } from '@/lib/events/views';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Host door list (Munaasabado Task 6, brief item 9): mark who actually came.
 * The page renders this only when the loader hands over a door list (host,
 * event started) — attendance is never recorded before the door opens.
 *
 * The checkbox reflects the SERVER's stamp (checked_in_at) and nothing else:
 * a change POSTs to the checkin route, then router.refresh() re-reads the
 * official record. One POST in flight at a time — the rows disable while the
 * stamp lands so the count can never race itself.
 */
export function CheckinList({ slug, rows }: { slug: string; rows: EventCheckinRow[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (rows.length === 0) return null;

  async function toggle(userId: string, checkedIn: boolean) {
    setPending(true);
    setError(null);
    try {
      await apiPost(`/api/events/${slug}/checkin`, { userId, checkedIn });
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="xidig-event-detail__card xidig-event-checkin">
      <h2 className="xidig-event-detail__label">{t('events.checkinTitle')}</h2>
      <p className="xidig-event-checkin__hint">{t('events.checkinHint')}</p>
      {error ? <PlainErrorBanner error={error} /> : null}
      <ul className="xidig-event-checkin__list">
        {rows.map((row) => (
          <li key={row.userId} className="xidig-event-checkin__row">
            <span id={`checkin-name-${row.userId}`} className="xidig-event-checkin__name">
              {row.displayName}
            </span>
            <label className="xidig-event-checkin__mark">
              {/* aria-labelledby ties each checkbox to ITS attendee: a
                  screen reader hears "Cali Maxamed Yimid", never twenty
                  indistinguishable "Yimid" checkboxes (final-review fix 7). */}
              <input
                type="checkbox"
                aria-labelledby={`checkin-name-${row.userId} checkin-verb-${row.userId}`}
                checked={row.checkedInAt !== null}
                disabled={pending}
                onChange={(event) => void toggle(row.userId, event.target.checked)}
              />{' '}
              <span id={`checkin-verb-${row.userId}`}>{t('events.checkedInLabel')}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
