'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { SystemNotice } from '@/components/system-notice';
import { flushRsvpQueue, list as listQueued } from '@/lib/events/rsvp-queue';

/**
 * Frame e3 — the events list going offline. Two honest sentences, both in
 * system chrome:
 *
 *  - while offline, a SystemNotice states the list's TRUE age ("Liiskani waa
 *    kii {age}"): `renderedAt` is the server render moment, the age keeps
 *    ticking (minute granularity) so the sentence never quietly goes stale;
 *  - when the connection returns — or on a fresh mount while ALREADY online
 *    with intents still parked (a reload never fires 'online'; without the
 *    mount flush the queue would stay wedged forever) — the queued RSVPs
 *    flush; an entry the server definitively REFUSED, or one the queue
 *    dropped as EXPIRED (older than the TTL — never replayed over choices
 *    made on other devices), surfaces the e3 error card — a human sentence
 *    with a next step (Isku day), never a blank region. A merely kept
 *    (still-offline-ish) entry stays queued and says nothing here — its own
 *    island still shows the queued chip.
 *
 * Renders nothing at all while online with nothing to report — the notice is
 * chrome for a condition, not furniture.
 */
export function EventsOfflineNotice({ renderedAt }: { renderedAt: number }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [flushFailed, setFlushFailed] = useState(false);
  // Minute tick while offline so the stated age stays true.
  const [, setTick] = useState(0);

  const runFlush = useCallback(() => {
    void flushRsvpQueue().then((result) => {
      // Refused AND expired both mean "your parked RSVP did not go out" —
      // the same generic error card (events.errorTitle/Body) covers both;
      // the copy stays honest without a new dictionary key.
      setFlushFailed(result.refused > 0 || result.expired > 0);
      if (result.sent > 0) router.refresh();
    });
  }, [router]);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      runFlush();
    };
    if (!navigator.onLine) setOffline(true);
    // Reload wedge: 'online' only fires on a transition, so a reload while
    // already online must flush any parked intents itself (single-flight in
    // the queue module — concurrent islands share one pass).
    else if (listQueued().length > 0) runFlush();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [runFlush]);

  useEffect(() => {
    if (!offline) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [offline]);

  if (!offline && !flushFailed) return null;

  return (
    <>
      {offline ? (
        <SystemNotice
          tone="info"
          messageKey="events.offlineStale"
          params={{ age: formatRelativeTime(renderedAt, locale) }}
        />
      ) : null}
      {flushFailed && !offline ? (
        <div className="xidig-event-list__error">
          <span className="xidig-event-list__error-lines">
            <span className="xidig-event-list__error-title">{t('events.errorTitle')}</span>
            <span className="xidig-event-list__error-body">{t('events.errorBody')}</span>
          </span>
          <button type="button" className="xidig-button xidig-button--secondary" onClick={runFlush}>
            {t('events.retry')}
          </button>
        </div>
      ) : null}
    </>
  );
}
