'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { LANES } from '@/lib/lanes';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Profile create/edit form (§10 fields, §20 complete-profile). Sends the FULL
 * profileInputSchema payload to PUT /api/me/profile — fields the form doesn't
 * expose (lat/lng/timezone) pass through from the snapshot untouched so a
 * save never silently nulls them.
 *
 * Contact options (§13): the member adds only the channels they want members
 * to see — whatsapp / email / website. Empty inputs are omitted entirely.
 */

interface LinkRow {
  label: string;
  url: string;
}

export interface ProfileSnapshot {
  display_name: string;
  handle: string;
  bio: string | null;
  location_city: string | null;
  location_country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  skills: string[];
  lanes: string[];
  links: LinkRow[];
  contact_options: Record<string, string | boolean>;
}

function contactString(snapshot: ProfileSnapshot | null, key: string): string {
  const value = snapshot?.contact_options?.[key];
  return typeof value === 'string' ? value : '';
}

export function ProfileForm({ snapshot }: { snapshot: ProfileSnapshot | null }) {
  const t = useT();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(snapshot?.display_name ?? '');
  const [handle, setHandle] = useState(snapshot?.handle ?? '');
  const [bio, setBio] = useState(snapshot?.bio ?? '');
  const [city, setCity] = useState(snapshot?.location_city ?? '');
  const [country, setCountry] = useState(snapshot?.location_country ?? '');
  const [skillsText, setSkillsText] = useState((snapshot?.skills ?? []).join(', '));
  const [lanes, setLanes] = useState<string[]>(snapshot?.lanes ?? []);
  const [links, setLinks] = useState<LinkRow[]>(snapshot?.links ?? []);
  const [whatsapp, setWhatsapp] = useState(contactString(snapshot, 'whatsapp'));
  const [email, setEmail] = useState(contactString(snapshot, 'email'));
  const [website, setWebsite] = useState(contactString(snapshot, 'website'));

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggleLane(lane: string) {
    setLanes((current) =>
      current.includes(lane) ? current.filter((l) => l !== lane) : [...current, lane],
    );
  }

  function setLink(index: number, patch: Partial<LinkRow>) {
    setLinks((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void (async () => {
      setPending(true);
      setError(null);
      setNotice(null);
      try {
        const contact: Record<string, string | boolean> = {};
        if (whatsapp.trim()) contact.whatsapp = whatsapp.trim();
        if (email.trim()) contact.email = email.trim();
        if (website.trim()) contact.website = website.trim();

        // Preserve non-string contact choices the form doesn't manage.
        for (const [key, value] of Object.entries(snapshot?.contact_options ?? {})) {
          if (!(key in contact) && typeof value === 'boolean') contact[key] = value;
        }

        await apiPut('/api/me/profile', {
          display_name: displayName.trim(),
          handle: handle.trim().toLowerCase(),
          bio: bio.trim() || null,
          location_city: city.trim() || null,
          location_country: country.trim() || null,
          latitude: snapshot?.latitude ?? null,
          longitude: snapshot?.longitude ?? null,
          timezone: snapshot?.timezone ?? null,
          skills: skillsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 50),
          lanes,
          links: links.filter((row) => row.label.trim() && row.url.trim()),
          contact_options: contact,
        });
        setNotice(t('profile.saved'));
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <form className="xidig-form" onSubmit={onSubmit}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="profile-display-name">
          {t('profile.displayNameLabel')}
        </label>
        <input
          id="profile-display-name"
          className="xidig-field__input"
          required
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="profile-handle">
          {t('profile.handleLabel')}
        </label>
        <input
          id="profile-handle"
          className="xidig-field__input"
          required
          pattern="[a-z0-9_]{3,30}"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <p className="xidig-field__hint">{t('profile.handleHint')}</p>
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="profile-bio">
          {t('profile.bioLabel')}
        </label>
        <textarea
          id="profile-bio"
          className="xidig-field__input"
          rows={3}
          maxLength={500}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="profile-city">
          {t('profile.cityLabel')}
        </label>
        <input
          id="profile-city"
          className="xidig-field__input"
          maxLength={120}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="profile-country">
          {t('profile.countryLabel')}
        </label>
        <input
          id="profile-country"
          className="xidig-field__input"
          maxLength={120}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="profile-skills">
          {t('profile.skillsLabel')}
        </label>
        <input
          id="profile-skills"
          className="xidig-field__input"
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
        />
        <p className="xidig-field__hint">{t('profile.skillsHint')}</p>
      </div>

      <fieldset className="xidig-field">
        <legend className="xidig-field__label">{t('profile.lanesLabel')}</legend>
        <p className="xidig-field__hint">{t('profile.lanesHint')}</p>
        <div className="xidig-chip-row">
          {LANES.map((lane) => (
            <label key={lane} className="xidig-checkbox">
              <input
                type="checkbox"
                checked={lanes.includes(lane)}
                onChange={() => toggleLane(lane)}
              />
              <span>{lane}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="xidig-field">
        <legend className="xidig-field__label">{t('profile.linksLabel')}</legend>
        <div className="xidig-row-editor">
          {links.map((row, index) => (
            <div key={index} className="xidig-row-editor__row">
              <input
                className="xidig-field__input"
                aria-label={t('profile.linkLabelLabel')}
                maxLength={40}
                value={row.label}
                onChange={(e) => setLink(index, { label: e.target.value })}
              />
              <input
                className="xidig-field__input"
                aria-label={t('profile.linkUrlLabel')}
                type="url"
                value={row.url}
                onChange={(e) => setLink(index, { url: e.target.value })}
              />
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                aria-label={t('a11y.removeRow')}
                onClick={() => setLinks((current) => current.filter((_, i) => i !== index))}
              >
                {t('action.remove')}
              </button>
            </div>
          ))}
          {links.length < 10 ? (
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              onClick={() => setLinks((current) => [...current, { label: '', url: '' }])}
            >
              {t('action.addLink')}
            </button>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="xidig-field">
        <legend className="xidig-field__label">{t('profile.contactTitle')}</legend>
        <p className="xidig-field__hint">{t('profile.contactHint')}</p>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="profile-contact-whatsapp">
            {t('profile.contactWhatsappLabel')}
          </label>
          <input
            id="profile-contact-whatsapp"
            className="xidig-field__input"
            inputMode="tel"
            maxLength={200}
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="profile-contact-email">
            {t('profile.contactEmailLabel')}
          </label>
          <input
            id="profile-contact-email"
            className="xidig-field__input"
            type="email"
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="profile-contact-website">
            {t('profile.contactWebsiteLabel')}
          </label>
          <input
            id="profile-contact-website"
            className="xidig-field__input"
            maxLength={200}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </fieldset>

      <button
        type="submit"
        className="xidig-button xidig-button--primary"
        disabled={pending}
      >
        {t('action.save')}
      </button>
    </form>
  );
}
