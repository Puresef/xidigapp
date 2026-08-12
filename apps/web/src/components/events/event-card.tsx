import Link from 'next/link';

import type { Locale } from '@xidig/i18n';

import { Avatar } from '@/components/media/avatar';
import { MediaSlot } from '@/components/media/media-slot';
import { eventDateParts } from '@/lib/events/datetime';
import type { EventCardItem } from '@/lib/events/views';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';

import { RsvpButtons } from './rsvp-buttons';

/**
 * EventCard — frame 9a and the e5/e6 states (Munaasabado dispatch, Task 5).
 * Server component; the RSVP verb is the only client island inside.
 *
 * Anatomy (frame-exact): optional cover through MediaSlot (Lite defers the
 * bytes, never the card) → date block (surface-2, big day + uppercased month
 * abbreviation — the dictionary stores "Ago", CSS shouts it) → title → meta
 * line → host provenance (Warshad glyph or member disc) → footer with the
 * ≤3-disc attendee tease, the capacity FACT, and the single verb.
 *
 * Honesty rules this card renders (locked design, not styling):
 *  - counts are confirmed RSVPs — "kama badna, kama yara"; capacity full is
 *    a fact with the release rule, never urgency or a waitlist;
 *  - past events report what happened (attended count + photos/report link)
 *    and carry NO RSVP control at all;
 *  - cancelled events stay on the record: dimmed, struck title, tagged — a
 *    host cancellation never deletes past truth (e6).
 */

export type EventCardVariant = 'default' | 'past' | 'cancelled';

/** The card wall is a tease of ≤3 discs, never the named wall itself. */
const STACK_LIMIT = 3;

export async function EventCard({
  item,
  prefs,
  // Part of the produced interface for callers that already resolved it; the
  // card itself is dictionary-driven (eventDateParts / t) end to end.
  locale: _locale,
  variant = 'default',
  withRsvp = true,
}: {
  item: EventCardItem;
  prefs: LitePrefs;
  locale: Locale;
  variant?: EventCardVariant;
  /** False on the signed-out index: no RSVP island, no floored counts. */
  withRsvp?: boolean;
}) {
  const t = await getT();
  const parts = eventDateParts(t, item.startsAt, item.endsAt, item.timezone);

  const venue = item.venueName ?? (item.mode === 'online' ? t('events.venueOnline') : null);
  const metaLine = [parts.weekday, parts.timeRange ?? parts.time, venue]
    .filter((part): part is string => part !== null)
    .join(' · ');

  const capacityLine =
    item.capacity !== null && item.isFull
      ? t('events.capacityFullLine', { capacity: item.capacity })
      : item.capacity !== null
        ? t('events.capacityConfirmed', { going: item.goingCount, capacity: item.capacity })
        : t('events.confirmedNoLimit', { count: item.goingCount });

  const showRsvp = withRsvp && variant === 'default' && !item.isPast && item.status === 'published';
  const stack = item.attendeeSample.slice(0, STACK_LIMIT);

  const dateBlock = (
    <span className="xidig-event-card__date">
      <span aria-hidden="true" className="xidig-event-card__date-visual">
        <span className="num xidig-event-card__day">{parts.day}</span>
        <span className="xidig-event-card__month">{parts.monthShort}</span>
      </span>
      <span className="xidig-visually-hidden">
        {parts.weekday} {parts.day} {parts.month}
      </span>
    </span>
  );

  const title = (
    <Link className="xidig-event-card__title" href={`/events/${item.slug}`}>
      {item.title}
    </Link>
  );

  const articleClass = [
    'xidig-event-card',
    variant === 'past' ? 'xidig-event-card--past' : null,
    variant === 'cancelled' ? 'xidig-event-card--cancelled' : null,
  ]
    .filter(Boolean)
    .join(' ');

  // e6 — the dimmed record: date, struck title, cancellation tag. No meta,
  // no wall, no verb; the record is the whole message.
  if (variant === 'cancelled') {
    return (
      <article className={articleClass}>
        <div className="xidig-event-card__body">
          <div className="xidig-event-card__head">
            {dateBlock}
            <span className="xidig-event-card__main">
              {title}
              <span className="xidig-tag xidig-event-card__tag">{t('events.statusCancelled')}</span>
            </span>
          </div>
        </div>
      </article>
    );
  }

  // Past — the report card: what actually happened, and where the story is.
  if (variant === 'past') {
    return (
      <article className={articleClass}>
        <div className="xidig-event-card__body">
          <div className="xidig-event-card__head">
            {dateBlock}
            <span className="xidig-event-card__main">
              {title}
              <span className="num xidig-event-card__meta">
                {t('events.pastAttended', { count: item.attendedCount ?? item.goingCount })}
              </span>
              <Link className="xidig-event-card__report" href={`/events/${item.slug}`}>
                {t('events.pastPhotosReport')}
              </Link>
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={articleClass}>
      {item.coverUrl ? (
        <MediaSlot
          kind="image"
          src={item.coverUrl}
          thumbSrc={item.coverThumbUrl ?? undefined}
          blurhash={item.coverBlurhash}
          alt={t('events.coverAlt', { title: item.title })}
          estBytes={140_000}
          prefs={prefs}
          className="xidig-event-card__cover"
        />
      ) : null}
      <div className="xidig-event-card__body">
        <div className="xidig-event-card__head">
          {dateBlock}
          <span className="xidig-event-card__main">
            {title}
            <span className="xidig-event-card__meta">{metaLine}</span>
            {item.host ? (
              <span className="xidig-event-card__host">
                {item.host.kind === 'lab' ? (
                  // Warshad provenance: the lab flask glyph (frame 9a).
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9.6 3.4h4.8" />
                    <path d="M10.4 3.4v4.9L5.3 17.8a2.1 2.1 0 0 0 1.9 3h9.6a2.1 2.1 0 0 0 1.9-3L13.6 8.3V3.4" />
                    <path d="M7.8 14.2h8.4" />
                  </svg>
                ) : (
                  <Avatar
                    name={item.host.name}
                    handle={item.host.href.split('/').pop() ?? item.host.name}
                    size={16}
                    prefs={prefs}
                  />
                )}
                {t(item.host.kind === 'lab' ? 'events.hostLineLab' : 'events.hostLineMember', {
                  name: item.host.name,
                })}
              </span>
            ) : null}
          </span>
        </div>
        {withRsvp ? (
          <div className="xidig-event-card__foot">
            {stack.length > 0 ? (
              <span className="xidig-event-card__stack">
                {stack.map((attendee) => (
                  <Avatar
                    key={attendee.handle}
                    name={attendee.displayName}
                    handle={attendee.handle}
                    size={24}
                    prefs={prefs}
                  />
                ))}
              </span>
            ) : null}
            <span className="num xidig-event-card__count">{capacityLine}</span>
            {showRsvp ? (
              <RsvpButtons
                slug={item.slug}
                rsvp={item.viewerRsvp}
                isFull={item.isFull}
                presentation="card"
              />
            ) : null}
          </div>
        ) : null}
        {showRsvp && item.isFull && item.viewerRsvp?.status !== 'going' ? (
          // e5: the release rule, stated — no waitlist, no bought priority.
          <p className="xidig-event-card__note">{t('events.fullReleaseNote')}</p>
        ) : null}
      </div>
    </article>
  );
}
