'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import {
  enqueue,
  flushRsvpQueue,
  list as listQueued,
  remove as removeQueued,
  subscribe as subscribeQueue,
  type QueuedRsvp,
} from '@/lib/events/rsvp-queue';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * RSVP controls (extras item 8, locked; card presentation from frame 9a):
 * going/interested only — absence is "no". Soft capacity: the server 409s
 * 'going' when full; 'interested' keeps working.
 *
 * Presentations:
 *  - 'detail' (default) — the existing detail-page control set, capability
 *    intact: Going + Interested + Remove, plus the show-publicly checkbox
 *    (Task 6 re-homes the checkbox beneath the attendee wall via
 *    ShowPubliclyToggle and passes withShowPublicly={false} here so the
 *    choice is made in exactly one place);
 *  - 'card' — the frame's single verb: primary "Waan imanayaa" when the
 *    member has not confirmed (disabled when full), the confirmed secondary
 *    with the check + the calendar link when they have. One tap backs out —
 *    the seat frees up for someone else (frame 9b's promise).
 *
 * Offline queue (frame e3): a PUT/DELETE that fails while the device is
 * OFFLINE becomes a queued intent with its true timestamp and renders the
 * queued chip. A 4xx/5xx is an ANSWER — surfaced, never queued. The queue
 * flushes on `window 'online'` AND once on mount while already online (a
 * reload never fires 'online', so mount is the only chance to unstick a
 * queue parked before the reload) — re-entrant safe across mounted islands.
 */
export function RsvpButtons({
  slug,
  rsvp,
  isFull,
  presentation = 'detail',
  withShowPublicly = true,
}: {
  slug: string;
  rsvp: { status: 'going' | 'interested'; showPublicly?: boolean } | null;
  isFull: boolean;
  presentation?: 'card' | 'detail';
  /** False when the page hosts the checkbox elsewhere (detail-page wall). */
  withShowPublicly?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  /** Non-envelope failure while ONLINE (server unreachable, no answer). */
  const [failed, setFailed] = useState(false);
  const [showPublicly, setShowPublicly] = useState(rsvp?.showPublicly ?? false);
  // null on the server and the first client paint (hydration-stable);
  // the effect below syncs it from localStorage and the queue bus.
  const [queued, setQueued] = useState<QueuedRsvp | null>(null);

  useEffect(() => {
    const sync = () => setQueued(listQueued().find((item) => item.slug === slug) ?? null);
    sync();
    return subscribeQueue(sync);
  }, [slug]);

  useEffect(() => {
    const runFlush = () => {
      void flushRsvpQueue().then((result) => {
        if (result.sent > 0) router.refresh();
      });
    };
    // 'online' only fires on an offline→online TRANSITION — a reload while
    // already online would strand queued intents forever, so mount also
    // flushes when there is anything to send (flush() is single-flight, so
    // many islands mounting at once still share one pass).
    if (navigator.onLine && listQueued().length > 0) runFlush();
    window.addEventListener('online', runFlush);
    return () => window.removeEventListener('online', runFlush);
  }, [router]);

  function settle(cause: unknown, intent: Omit<QueuedRsvp, 'queuedAt'>): void {
    if (cause instanceof ApiRequestError) {
      // A definitive server answer — surfaced, never queued, even if
      // `navigator.onLine` is stale/wrong (the response itself is proof a
      // network round-trip completed).
      // PlainErrorBanner falls back to the generic §27 server copy when the
      // response carried no envelope message.
      setError(cause.plain);
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // No network at all — park the intent with its true timestamp.
      enqueue({ ...intent, queuedAt: Date.now() });
      return;
    }
    setFailed(true);
  }

  async function set(status: 'going' | 'interested', show: boolean) {
    setPending(true);
    setError(null);
    setFailed(false);
    try {
      await apiPut(`/api/events/${slug}/rsvp`, { status, showPublicly: show });
      router.refresh();
    } catch (cause) {
      settle(cause, { slug, action: 'rsvp', status, showPublicly: show });
    } finally {
      setPending(false);
    }
  }

  // The verb PUT always needs an explicit showPublicly — omitting it on an
  // existing RSVP would hit the zod default (true) and silently re-publicize
  // an opted-out member. When the checkbox lives here (withShowPublicly),
  // the internal `showPublicly` state IS the source of truth. When it lives
  // elsewhere (ShowPubliclyToggle, detail page), `showPublicly` state goes
  // stale the moment the external toggle changes it — `router.refresh()`
  // only updates props, not this component's state — so the verb must read
  // the fresh, server-confirmed value straight off the `rsvp` prop instead.
  function verbShowPublicly(): boolean {
    return withShowPublicly ? showPublicly : (rsvp?.showPublicly ?? true);
  }

  async function removeRsvp() {
    setPending(true);
    setError(null);
    setFailed(false);
    try {
      await apiDelete(`/api/events/${slug}/rsvp`);
      router.refresh();
    } catch (cause) {
      settle(cause, { slug, action: 'unrsvp', status: null, showPublicly: showPublicly });
    } finally {
      setPending(false);
    }
  }

  const failedLine = failed ? (
    <p className="xidig-event-card__err">{t('events.errorBody')}</p>
  ) : null;

  // Frame e3: the queued chip replaces the verb — the intent is parked, and
  // Tirtir withdraws it. True timestamp via formatRelativeTime.
  if (queued) {
    return (
      <div className="xidig-event-card__queued">
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="8.6" />
          <path d="M12 8v4.4l2.8 1.7" />
        </svg>
        <span className="xidig-event-card__queued-lines">
          <span className="xidig-event-card__queued-title">{t('events.queuedRsvp')}</span>
          <span className="xidig-event-card__queued-note">
            {t('events.queuedNote')}
            {' · '}
            {formatRelativeTime(queued.queuedAt, locale)}
          </span>
        </span>
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          onClick={() => removeQueued(slug)}
        >
          {t('action.delete')}
        </button>
      </div>
    );
  }

  if (presentation === 'card') {
    const confirmed = rsvp?.status === 'going';
    // A div, not a span: the failure line and the error banner are block
    // elements, and invalid nesting is a hydration mismatch waiting to happen.
    return (
      <div className="xidig-event-card__rsvp">
        {failedLine}
        {error ? <PlainErrorBanner error={error} /> : null}
        {confirmed ? (
          <>
            <a className="xidig-event-card__calendar" href={`/events/${slug}/calendar.ics`}>
              {t('events.addToCalendar')}
            </a>
            <button
              type="button"
              className="xidig-button xidig-button--secondary xidig-event-card__confirmed"
              aria-pressed="true"
              disabled={pending}
              onClick={() => void removeRsvp()}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
              {t('events.rsvpConfirmed')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="xidig-button xidig-button--primary"
            aria-pressed={false}
            disabled={pending || isFull}
            // The single verb never overrides a STORED show-publicly choice:
            // an existing RSVP (e.g. 'interested' set opted-out on the detail
            // page) keeps its own value; only a genuinely first RSVP takes
            // the named-wall default (true — the zod/DB default). The queued
            // offline intent carries the same resolved value via set().
            onClick={() => void set('going', rsvp?.showPublicly ?? true)}
          >
            {t('events.rsvpGoing')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="xidig-section">
      {error ? <PlainErrorBanner error={error} /> : null}
      {failedLine}
      {isFull && rsvp?.status !== 'going' ? (
        <p className="xidig-banner xidig-banner--notice">{t('events.fullLabel')}</p>
      ) : null}
      <div className="xidig-profile__actions">
        <button
          type="button"
          className={`xidig-button ${rsvp?.status === 'going' ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          aria-pressed={rsvp?.status === 'going'}
          disabled={pending || (isFull && rsvp?.status !== 'going')}
          onClick={() => void set('going', verbShowPublicly())}
        >
          {t('events.rsvpGoing')}
        </button>
        <button
          type="button"
          className={`xidig-button ${rsvp?.status === 'interested' ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          aria-pressed={rsvp?.status === 'interested'}
          disabled={pending}
          onClick={() => void set('interested', verbShowPublicly())}
        >
          {t('events.rsvpInterested')}
        </button>
        {rsvp ? (
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void removeRsvp()}
          >
            {t('events.rsvpRemove')}
          </button>
        ) : null}
      </div>
      {withShowPublicly ? (
        <label className="xidig-field__label">
          <input
            type="checkbox"
            checked={showPublicly}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.checked;
              setShowPublicly(next);
              // Persist immediately when an RSVP already exists.
              if (rsvp) void set(rsvp.status, next);
            }}
          />{' '}
          {t('events.showPubliclyLabel')}
        </label>
      ) : null}
    </div>
  );
}
