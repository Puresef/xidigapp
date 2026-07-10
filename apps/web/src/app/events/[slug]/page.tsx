import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CancelEventButton } from '@/components/events/cancel-event-button';
import { RsvpButtons } from '@/components/events/rsvp-buttons';
import { ShareActions } from '@/components/share-actions';
import { env } from '@/env';
import { getAuthContext } from '@/lib/auth/guards';
import { EVENT_SLUG_REGEX } from '@/lib/events/constants';
import { googleCalendarUrl } from '@/lib/events/ics';
import { getMemberEventView, getPublicEventView, type EventView } from '@/lib/events/views';
import { getLocale, getT } from '@/lib/locale';

import { formatEventStart } from '@/components/events/event-list';

export const dynamic = 'force-dynamic';

/**
 * Event permalink (extras item 8) — dual-mode share page (§28): members get
 * the RSVP controls + privacy-folded details; anonymous visitors get the
 * public projection (no address, no online link, no attendee identities) and
 * the "Request access to RSVP" waitlist CTA with event attribution.
 */

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
    title: `${view.event.title} — Xidig`,
    description: view.event.description.slice(0, 160) || undefined,
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { view, member } = await loadView(slug);
  if (!view) notFound();

  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const e = view.event;

  const modeLabels: Record<string, string> = {
    online: t('events.modeOnline'),
    in_person: t('events.modeInPerson'),
    hybrid: t('events.modeHybrid'),
  };
  const categoryLabel = view.category
    ? locale === 'so' && view.category.nameSo
      ? view.category.nameSo
      : view.category.nameEn
    : e.category_id;

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

  const isModeratedAway = e.moderation_status !== undefined && e.moderation_status !== 'published';

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{e.title}</h1>

      {e.status === 'cancelled' ? (
        <p className="xidig-banner xidig-banner--error">{t('events.statusCancelled')}</p>
      ) : null}
      {e.status === 'draft' ? (
        <p className="xidig-banner xidig-banner--notice">{t('events.statusDraft')}</p>
      ) : null}
      {isModeratedAway ? (
        <p className="xidig-banner xidig-banner--notice">{t('events.awaitingReview')}</p>
      ) : null}

      <p className="xidig-card__meta">
        {formatEventStart({ startsAt: e.starts_at, timezone: e.timezone }, locale)}
        {' · '}
        {modeLabels[e.mode] ?? e.mode}
        {' · '}
        {categoryLabel}
      </p>

      {view.host ? (
        <p className="xidig-card__meta">
          <Link href={`/u/${view.host.handle}`}>
            {t('events.hostedBy', { name: view.host.displayName })}
          </Link>
        </p>
      ) : null}
      {view.container ? (
        <p className="xidig-card__meta">
          <Link href={view.container.href}>
            {t('events.partOf', { name: view.container.name })}
          </Link>
        </p>
      ) : null}

      {e.description ? <p className="xidig-card__body">{e.description}</p> : null}

      {e.venue_name || view.reveal.venueAddress ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('events.venueLabel')}</h2>
          {e.venue_name ? <p className="xidig-card__body">{e.venue_name}</p> : null}
          {view.reveal.venueAddress ? (
            <p className="xidig-card__body">{view.reveal.venueAddress}</p>
          ) : (
            <p className="xidig-card__meta">{t('events.addressForAttendees')}</p>
          )}
        </section>
      ) : null}

      {e.mode !== 'in_person' ? (
        view.reveal.onlineUrl ? (
          <p>
            <a
              className="xidig-button xidig-button--secondary"
              href={view.reveal.onlineUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t('events.joinOnline')}
            </a>
          </p>
        ) : (
          <p className="xidig-card__meta">{t('events.onlineForAttendees')}</p>
        )
      ) : null}

      <section className="xidig-section">
        {view.goingExact !== null && e.capacity !== null ? (
          <p className="xidig-card__meta">
            {t('events.capacityGoing', { count: view.goingExact, capacity: e.capacity })}
          </p>
        ) : null}
        {view.counts.going !== null ? (
          <p className="xidig-card__meta">{t('events.goingCount', { count: view.counts.going })}</p>
        ) : null}
        {view.counts.interested !== null ? (
          <p className="xidig-card__meta">
            {t('events.interestedCount', { count: view.counts.interested })}
          </p>
        ) : null}
      </section>

      {member && e.status === 'published' && !isModeratedAway ? (
        <RsvpButtons slug={e.slug} rsvp={view.viewer.rsvp} isFull={view.isFull} />
      ) : null}

      {!member ? (
        <section className="xidig-section">
          <p className="xidig-card__body">{t('events.signedOutNote')}</p>
          <Link
            href={`/waitlist?from=event-${e.slug}`}
            className="xidig-button xidig-button--primary"
          >
            {t('events.requestAccessCta')}
          </Link>
        </section>
      ) : null}

      {view.attendees.length > 0 ? (
        <section className="xidig-section">
          <h2 className="xidig-section__title">{t('events.attendeesTitle')}</h2>
          <p className="xidig-card__meta">
            {view.viewer.isHost ? t('events.attendeesHostNote') : t('events.attendeesMemberNote')}
          </p>
          <ul className="xidig-invite-list">
            {view.attendees.map((attendee) => (
              <li key={attendee.handle} className="xidig-invite-list__item">
                <Link href={`/u/${attendee.handle}`}>{attendee.displayName}</Link>
                <span className="xidig-card__meta">
                  {' '}
                  {attendee.status === 'going' ? t('events.rsvpGoing') : t('events.rsvpInterested')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {e.status === 'published' ? (
        <section className="xidig-section">
          <p className="xidig-profile__actions">
            <a className="xidig-button xidig-button--secondary" href={`/events/${e.slug}/calendar.ics`}>
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
          </p>
          <ShareActions
            path={`/events/${e.slug}`}
            text={t('events.shareText', { title: e.title })}
          />
        </section>
      ) : null}

      {view.viewer.isHost && e.status !== 'cancelled' ? (
        <CancelEventButton slug={e.slug} />
      ) : null}
    </main>
  );
}
