import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { BackLink } from '@/components/back-link';
import { CancelEventButton } from '@/components/events/cancel-event-button';
import { CheckinList } from '@/components/events/checkin-list';
import { RsvpButtons } from '@/components/events/rsvp-buttons';
import { ShowPubliclyToggle } from '@/components/events/show-publicly-toggle';
import { Avatar } from '@/components/media/avatar';
import { MediaSlot } from '@/components/media/media-slot';
import { ReportControl } from '@/components/report-control';
import { ShareActions } from '@/components/share-actions';
import { SystemNotice } from '@/components/system-notice';
import { env } from '@/env';
import { getAuthContext } from '@/lib/auth/guards';
import { EVENT_SLUG_REGEX } from '@/lib/events/constants';
import { eventDateParts } from '@/lib/events/datetime';
import { googleCalendarUrl } from '@/lib/events/ics';
import {
  getMemberEventView,
  getPublicEventView,
  isEnded,
  resolveVenueFacts,
  type EventView,
} from '@/lib/events/views';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Event permalink — frame 9b + the e6 cancelled state (Munaasabado Task 6).
 * Dual-mode share page (§28): members get the full detail — named attendee
 * wall, agenda, sticky facts aside with the RSVP island, host card, door
 * list — while anonymous visitors get the public projection (no address, no
 * online link, no attendee identities) and the waitlist CTA.
 *
 * Honesty rules this page renders (locked design, not styling):
 *  - capacity is a FACT ("14 / 30 boos") with the release rule, never
 *    urgency or a waitlist;
 *  - the wall is named — an RSVP is a social commitment, not a hidden
 *    number — and the "+N kale" remainder is exact going-count arithmetic;
 *  - a past event is a record (attended count, no RSVP verb); a cancelled
 *    one keeps the record dimmed under a SystemNotice — system voice in
 *    chrome, never inside the host's content (e6).
 */

/** The wall shows this many named entries; the rest fold into "+N kale". */
const WALL_LIMIT = 24;

async function loadView(slug: string): Promise<{ view: EventView | null; member: boolean }> {
  if (!EVENT_SLUG_REGEX.test(slug)) return { view: null, member: false };
  const ctx = await getAuthContext();
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');
  if (!ctx || blocked) return { view: await getPublicEventView(slug), member: false };
  return { view: await getMemberEventView(ctx, slug), member: true };
}

/**
 * The cancellation date for the e6 notice. Not part of EventView (Task 4's
 * interface is frozen), but a cancelled event takes no further writes —
 * PATCH 409s and a second DELETE no-ops — so updated_at IS the moment the
 * host cancelled. One indexed single-row read, cancelled pages only.
 */
async function loadCancelledOn(eventId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from('events')
    .select('updated_at')
    .eq('id', eventId)
    .maybeSingle();
  return data?.updated_at ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!EVENT_SLUG_REGEX.test(slug)) return {};
  const view = await getPublicEventView(slug);
  if (!view) return {};
  return {
    // Brand suffix comes from the root title.template.
    title: view.event.title,
    description: view.event.description.slice(0, 160) || undefined,
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { view, member } = await loadView(slug);
  if (!view) notFound();

  const [t, prefs] = await Promise.all([getT(), getLitePrefs()]);
  const e = view.event;

  const cancelled = e.status === 'cancelled';
  const past = isEnded(e, new Date());
  // Retained content: the host's account was deleted. Upcoming = no longer
  // running (no RSVP / calendar / wall / reveal); past = a record whose host
  // renders as the tombstone, unlinked and without host stats.
  const notListed = view.hostState === 'host_deleted_upcoming';
  const hostGone = view.hostState !== 'host_present';
  const isModeratedAway = e.moderation_status !== undefined && e.moderation_status !== 'published';
  const parts = eventDateParts(t, e.starts_at, e.ends_at, e.timezone);
  // The e6 notice is member-only (it states the exact RSVP count, which the
  // signed-out projection deliberately doesn't know) — skip the admin read
  // entirely for anon viewers instead of fetching a value nothing renders.
  const cancelledOn = cancelled && member ? await loadCancelledOn(e.id) : null;
  // Dictionary-owned, same as `parts`/`metaLine` below (datetime.ts) — never
  // Intl (`formatDate`), which put a different, Intl-derived Somali month
  // abbreviation on screen two rows above the meta line's dictionary one.
  const cancelledOnParts = cancelledOn ? eventDateParts(t, cancelledOn, null, e.timezone) : null;

  const venue = e.venue_name ?? (e.mode !== 'in_person' ? t('events.venueOnline') : null);
  // Facts-card "Goobta" row: NOT gated on `venue` — an in-person event with
  // no venue_name but a revealed address (attendee/host, or 'everyone'
  // visibility) still has something to show (review fix 1).
  const venueFacts = resolveVenueFacts(e, view.reveal, t);
  const metaLine = [
    `${parts.weekday} ${parts.day} ${parts.month}`,
    parts.timeRange ?? parts.time,
    venue,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  const calendarInput = {
    slug: e.slug,
    title: e.title,
    description: e.description,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    location:
      [e.venue_name, view.reveal.venueAddress].filter(Boolean).join(', ') ||
      view.reveal.onlineUrl ||
      null,
    url: `${env.APP_URL.replace(/\/$/, '')}/events/${e.slug}`,
  };

  // Status tag (frame 9b): Open while the door is open, Cancelled on the e6
  // record, nothing on a finished event — pastness is the date's job.
  const statusTag = cancelled
    ? t('events.statusCancelled')
    : notListed
      ? t('events.statusNotListed')
      : e.status === 'published' && !past && !isModeratedAway
        ? t('events.statusOpen')
        : null;

  // The named wall: opted-in 'going' rows. The loader already folds per
  // audience (host sees every RSVP), so narrow to the going names here; the
  // "+N kale" remainder is exact arithmetic against the going total.
  const wall = view.attendees.filter((a) => a.status === 'going').slice(0, WALL_LIMIT);
  const wallRemainder = Math.max(0, view.goingTotal - wall.length);
  const showWall = member && (wall.length > 0 || view.goingTotal > 0);

  const rsvpOpen = member && e.status === 'published' && !isModeratedAway && !past && !notListed;
  const factWhen = `${parts.weekday} ${parts.day} ${parts.monthShort} · ${parts.time}`;
  const seatsLine =
    view.counts.going === null
      ? null
      : e.capacity !== null
        ? t('events.capacityConfirmedShort', { going: view.counts.going, capacity: e.capacity })
        : t('events.confirmedNoLimit', { count: view.counts.going });

  // Host card (frame 9b): the Warshad glyph tile when a Lab hosts, else the
  // member's disc — both with the container's own past-events track record.
  const hostCard =
    view.container?.kind === 'lab'
      ? { kind: 'lab' as const, name: view.container.name, href: view.container.href }
      : view.host
        ? {
            kind: 'member' as const,
            name: view.host.displayName,
            // The tombstone profile is not a destination (signed-out it is a 404).
            href: hostGone ? null : `/u/${view.host.handle}`,
          }
        : null;

  const detailClass =
    cancelled || notListed
      ? 'xidig-event-detail xidig-event-detail--cancelled'
      : 'xidig-event-detail';
  const coverClass =
    cancelled || notListed
      ? 'xidig-event-detail__cover xidig-event-detail__cover--cancelled'
      : 'xidig-event-detail__cover';

  return (
    <main className="xidig-section xidig-event-page">
      {view.cover.coverUrl ? (
        <MediaSlot
          kind="image"
          src={view.cover.coverUrl}
          thumbSrc={view.cover.coverThumbUrl ?? undefined}
          blurhash={view.cover.coverBlurhash}
          alt={t('events.coverAlt', { title: e.title })}
          estBytes={250_000}
          width={1600}
          height={600}
          prefs={prefs}
          className={coverClass}
        />
      ) : null}

      <BackLink href="/events" labelKey="events.backToAll" />

      {e.status === 'draft' ? (
        <p className="xidig-banner xidig-banner--notice">{t('events.statusDraft')}</p>
      ) : null}
      {isModeratedAway ? (
        <p className="xidig-banner xidig-banner--notice">{t('events.awaitingReview')}</p>
      ) : null}
      {notListed ? (
        <p className="xidig-banner xidig-banner--notice">{t('events.hostDeletedNotice')}</p>
      ) : null}

      {/* e6 — system voice in chrome, above the dimmed record, never inside
          it. Member surfaces only: the notice states the exact RSVP count,
          which the signed-out projection deliberately doesn't know. The
          count matches what the DELETE handler actually did — it notifies
          EVERY RSVP, going AND interested (member counts are exact on this
          surface, so the sum is the true notified total), never just the
          going wall. */}
      {cancelled && member && cancelledOnParts ? (
        <SystemNotice
          tone="info"
          messageKey="events.cancelledNotice"
          params={{
            date: `${cancelledOnParts.day} ${cancelledOnParts.month} ${cancelledOnParts.year}`,
            count: (view.counts.going ?? 0) + (view.counts.interested ?? 0),
          }}
        />
      ) : null}

      <div className={detailClass}>
        <div className="xidig-event-detail__main">
          <div className="xidig-event-detail__titlerow">
            <h1 className="xidig-event-detail__title">{e.title}</h1>
            {statusTag ? <span className="xidig-tag">{statusTag}</span> : null}
          </div>
          <p className="xidig-event-detail__meta">{metaLine}</p>

          {view.container && view.container.kind !== 'lab' ? (
            <p className="xidig-event-detail__meta">
              <Link href={view.container.href}>
                {t('events.partOf', { name: view.container.name })}
              </Link>
            </p>
          ) : null}

          {e.description ? <p className="xidig-event-detail__desc">{e.description}</p> : null}

          {showWall ? (
            <section className="xidig-event-detail__card">
              <div className="xidig-event-wall__head">
                <h2 className="xidig-event-detail__label">{t('events.attendeesTitle')}</h2>
                {e.capacity !== null ? (
                  <span className="num xidig-event-wall__seats">
                    {t('events.capacitySeats', { going: view.goingTotal, capacity: e.capacity })}
                  </span>
                ) : null}
              </div>
              {wall.length > 0 || wallRemainder > 0 ? (
                <div className="xidig-event-wall">
                  {wall.map((attendee) => (
                    <Link
                      key={attendee.handle}
                      href={`/u/${attendee.handle}`}
                      className="xidig-event-wall__person"
                    >
                      <Avatar
                        name={attendee.displayName}
                        handle={attendee.handle}
                        size={24}
                        prefs={prefs}
                      />
                      {attendee.displayName}
                    </Link>
                  ))}
                  {wallRemainder > 0 ? (
                    <span className="num xidig-event-wall__more">
                      {t('events.moreAttendees', { count: wallRemainder })}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <p className="xidig-event-wall__note">{t('events.namesVisibleNote')}</p>
            </section>
          ) : null}

          {rsvpOpen && view.viewer.rsvp ? (
            <ShowPubliclyToggle slug={e.slug} rsvp={view.viewer.rsvp} />
          ) : null}

          {e.agenda.length > 0 ? (
            <section className="xidig-event-detail__card">
              <h2 className="xidig-event-detail__label">{t('events.agendaTitle')}</h2>
              <div className="xidig-event-agenda">
                {e.agenda.map((item, index) => (
                  <div key={index} className="xidig-event-agenda__row">
                    <span className="num xidig-event-agenda__time">{item.time}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {view.checkin?.enabled && !cancelled ? (
            <CheckinList slug={e.slug} rows={view.checkin.rows} />
          ) : null}

          {!member ? (
            <section className="xidig-event-detail__card">
              <p className="xidig-card__body">{t('events.signedOutNote')}</p>
              <Link
                href={`/waitlist?from=event-${e.slug}`}
                className="xidig-button xidig-button--primary"
              >
                {t('events.requestAccessCta')}
              </Link>
            </section>
          ) : null}
        </div>

        <aside className="xidig-event-detail__aside">
          <div className="xidig-event-detail__card">
            <dl className="xidig-event-facts">
              <dt>{t('events.factWhen')}</dt>
              <dd>{factWhen}</dd>
              {venueFacts.primary ? (
                <>
                  <dt>{t('events.factWhere')}</dt>
                  <dd>
                    {venueFacts.primary}
                    {venueFacts.secondary ? (
                      <span
                        className={
                          venueFacts.secondaryIsNote
                            ? 'xidig-event-facts__sub xidig-event-facts__note'
                            : 'xidig-event-facts__sub'
                        }
                      >
                        {venueFacts.secondary}
                      </span>
                    ) : null}
                  </dd>
                </>
              ) : null}
              {!past && seatsLine ? (
                <>
                  <dt>{t('events.factSeats')}</dt>
                  <dd className="num">{seatsLine}</dd>
                </>
              ) : null}
            </dl>

            {past && view.attendedCount !== null ? (
              <p className="num xidig-event-detail__note">
                {t('events.pastAttended', { count: view.attendedCount })}
              </p>
            ) : null}

            {e.mode !== 'in_person' ? (
              view.reveal.onlineUrl ? (
                <a
                  className="xidig-button xidig-button--secondary"
                  href={view.reveal.onlineUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t('events.joinOnline')}
                </a>
              ) : (
                <p className="xidig-event-detail__note">{t('events.onlineForAttendees')}</p>
              )
            ) : null}

            {rsvpOpen ? (
              <RsvpButtons
                slug={e.slug}
                rsvp={view.viewer.rsvp}
                isFull={view.isFull}
                withShowPublicly={false}
              />
            ) : null}

            {e.status === 'published' && !notListed ? (
              <div className="xidig-event-detail__actions">
                <a
                  className="xidig-button xidig-button--secondary"
                  href={`/events/${e.slug}/calendar.ics`}
                >
                  {t('events.addToCalendar')}
                </a>
                <a
                  className="xidig-button xidig-button--secondary"
                  href={googleCalendarUrl(calendarInput)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t('events.googleCalendar')}
                </a>
                <ShareActions
                  path={`/events/${e.slug}`}
                  text={t('events.shareText', { title: e.title })}
                />
              </div>
            ) : null}

            {rsvpOpen ? (
              <p className="xidig-event-detail__note">{t('events.cancelReleaseNote')}</p>
            ) : null}
          </div>

          {hostCard ? (
            <div className="xidig-event-detail__card">
              <h2 className="xidig-event-detail__label">{t('events.hostCardTitle')}</h2>
              <HostCardLink href={hostCard.href}>
                {hostCard.kind === 'lab' ? (
                  <span aria-hidden="true" className="xidig-event-host__glyph">
                    <svg
                      viewBox="0 0 24 24"
                      width="19"
                      height="19"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9.6 3.4h4.8" />
                      <path d="M10.4 3.4v4.9L5.3 17.8a2.1 2.1 0 0 0 1.9 3h9.6a2.1 2.1 0 0 0 1.9-3L13.6 8.3V3.4" />
                      <path d="M7.8 14.2h8.4" />
                    </svg>
                  </span>
                ) : (
                  <Avatar
                    name={hostCard.name}
                    handle={hostCard.href?.split('/').pop() ?? hostCard.name}
                    size={36}
                    prefs={prefs}
                  />
                )}
                <span className="xidig-event-host__lines">
                  <span className="xidig-event-host__name">{hostCard.name}</span>
                  {hostCard.href !== null ? (
                    <span className="num xidig-event-host__stat">
                      {t(
                        hostCard.kind === 'lab'
                          ? 'events.hostPastEventsLab'
                          : 'events.hostPastEventsMember',
                        { count: view.hostStats.pastEventsCount },
                      )}
                    </span>
                  ) : null}
                </span>
              </HostCardLink>
            </div>
          ) : null}

          {member ? (
            <ReportControl
              targetType="event"
              targetId={e.id}
              targetName={e.title}
              variant="quiet"
              labelKey="events.reportEvent"
            />
          ) : null}

          {view.viewer.isHost && !cancelled && !past ? <CancelEventButton slug={e.slug} /> : null}
        </aside>
      </div>
    </main>
  );
}

/**
 * The host card's wrapper: a link to the host, or — for a deleted host's
 * tombstone, which is not a destination — the same box without a link.
 */
function HostCardLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (href === null) return <div className="xidig-event-host">{children}</div>;
  return (
    <Link href={href} className="xidig-event-host">
      {children}
    </Link>
  );
}
