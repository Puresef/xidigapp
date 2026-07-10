'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Minimal event creation form (extras item 8) — same conventions as
 * ListingForm/SpaceForm. The "host as" select is built from the containers the
 * SERVER says the member may use (loadCreationOptions); the API re-checks —
 * this select is presentation, not security.
 */

export interface EventFormOptions {
  isModOrAdmin: boolean;
  labs: Array<{ id: string; name: string }>;
  listings: Array<{ id: string; businessName: string }>;
  categories: Array<{ slug: string; name: string }>;
}

interface CreatedEvent {
  event: { event: { slug: string } } | null;
}

export function EventForm({ options }: { options: EventFormOptions }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const containerChoices: Array<{ value: string; label: string }> = [
    ...(options.isModOrAdmin ? [{ value: 'none', label: t('events.containerCommunity') }] : []),
    ...options.labs.map((lab) => ({ value: `lab:${lab.id}`, label: lab.name })),
    ...options.listings.map((listing) => ({
      value: `listing:${listing.id}`,
      label: listing.businessName,
    })),
  ];

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(options.categories[0]?.slug ?? 'community');
  const [container, setContainer] = useState(containerChoices[0]?.value ?? 'none');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [timezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [mode, setMode] = useState<'online' | 'in_person' | 'hybrid'>('in_person');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [addressVisibility, setAddressVisibility] = useState<'everyone' | 'attendees'>('attendees');
  const [onlineUrl, setOnlineUrl] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'members' | 'space_only'>('members');
  const [capacity, setCapacity] = useState('');

  const isLabContainer = container.startsWith('lab:');
  const showVenue = mode !== 'online';
  const showOnline = mode !== 'in_person';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // datetime-local values carry no offset — interpret in the host's zone
      // via Date (browser zone === the picked default zone).
      const body: Record<string, unknown> = {
        title,
        description,
        category,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        timezone,
        mode,
        venueName: showVenue && venueName ? venueName : null,
        venueAddress: showVenue && venueAddress ? venueAddress : null,
        addressVisibility,
        onlineUrl: showOnline && onlineUrl ? onlineUrl : null,
        visibility,
        capacity: capacity ? Number(capacity) : null,
      };
      if (container.startsWith('lab:')) body.labId = container.slice(4);
      if (container.startsWith('listing:')) body.listingId = container.slice(8);

      const created = await apiPost<CreatedEvent>('/api/events', body);
      const slug = created.event?.event.slug;
      router.push(slug ? `/events/${slug}` : '/events');
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      setPending(false);
    }
  }

  return (
    <form className="xidig-form" onSubmit={onSubmit}>
      {error ? <PlainErrorBanner error={error} /> : null}

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-title">
          {t('events.formTitle')}
        </label>
        <input
          id="event-title"
          className="xidig-field__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-description">
          {t('events.formDescription')}
        </label>
        <textarea
          id="event-description"
          className="xidig-field__input"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-category">
          {t('events.formCategory')}
        </label>
        <select
          id="event-category"
          className="xidig-field__input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {options.categories.map((cat) => (
            <option key={cat.slug} value={cat.slug}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-container">
          {t('events.formContainer')}
        </label>
        <select
          id="event-container"
          className="xidig-field__input"
          value={container}
          onChange={(e) => {
            setContainer(e.target.value);
            if (!e.target.value.startsWith('lab:') && visibility === 'space_only') {
              setVisibility('members');
            }
          }}
        >
          {containerChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-starts">
          {t('events.formStartsAt')}
        </label>
        <input
          id="event-starts"
          type="datetime-local"
          className="xidig-field__input"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />
        <p className="xidig-field__hint">{t('events.formTimezone')}: {timezone}</p>
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-ends">
          {t('events.formEndsAt')}
        </label>
        <input
          id="event-ends"
          type="datetime-local"
          className="xidig-field__input"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-mode">
          {t('events.formMode')}
        </label>
        <select
          id="event-mode"
          className="xidig-field__input"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="in_person">{t('events.modeInPerson')}</option>
          <option value="online">{t('events.modeOnline')}</option>
          <option value="hybrid">{t('events.modeHybrid')}</option>
        </select>
      </div>

      {showVenue ? (
        <>
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="event-venue-name">
              {t('events.formVenueName')}
            </label>
            <input
              id="event-venue-name"
              className="xidig-field__input"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              maxLength={160}
            />
          </div>
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="event-venue-address">
              {t('events.formVenueAddress')}
            </label>
            <input
              id="event-venue-address"
              className="xidig-field__input"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="event-address-visibility">
              {t('events.formAddressVisibility')}
            </label>
            <select
              id="event-address-visibility"
              className="xidig-field__input"
              value={addressVisibility}
              onChange={(e) => setAddressVisibility(e.target.value as typeof addressVisibility)}
            >
              <option value="attendees">{t('events.addressAttendees')}</option>
              <option value="everyone">{t('events.addressEveryone')}</option>
            </select>
          </div>
        </>
      ) : null}

      {showOnline ? (
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="event-online-url">
            {t('events.formOnlineUrl')}
          </label>
          <input
            id="event-online-url"
            type="url"
            className="xidig-field__input"
            value={onlineUrl}
            onChange={(e) => setOnlineUrl(e.target.value)}
            maxLength={500}
          />
          <p className="xidig-field__hint">{t('events.formOnlineUrlHint')}</p>
        </div>
      ) : null}

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-visibility">
          {t('events.formVisibility')}
        </label>
        <select
          id="event-visibility"
          className="xidig-field__input"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
        >
          <option value="public">{t('events.visibilityPublic')}</option>
          <option value="members">{t('events.visibilityMembers')}</option>
          {isLabContainer ? (
            <option value="space_only">{t('events.visibilitySpaceOnly')}</option>
          ) : null}
        </select>
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="event-capacity">
          {t('events.formCapacity')}
        </label>
        <input
          id="event-capacity"
          type="number"
          min={1}
          className="xidig-field__input"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </div>

      <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
        {t('events.formSubmit')}
      </button>
    </form>
  );
}
