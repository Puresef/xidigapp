'use client';

import { useState, type FormEvent } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { apiPatch, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import {
  DM_PRIVACY_OPTIONS,
  LOCATION_GRANULARITY_OPTIONS,
  type DmPrivacy,
  type LocationGranularity,
  type UserSettingsView,
} from '@/lib/settings/model';

import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Privacy & Safety controls (§26): who can DM me, where I appear
 * (directory / search engines), and how precisely my location shows.
 * Saves through PATCH /api/me/settings (user_settings writes are API-only).
 */

const DM_PRIVACY_LABELS: Record<DmPrivacy, MessageKey> = {
  everyone: 'settings.dmPrivacyEveryone',
  verified: 'settings.dmPrivacyVerified',
  none: 'settings.dmPrivacyNone',
};

const LOCATION_LABELS: Record<LocationGranularity, MessageKey> = {
  exact: 'settings.locationExact',
  city: 'settings.locationCity',
  region: 'settings.locationRegion',
  hidden: 'settings.locationHidden',
};

export function PrivacySettings({ snapshot }: { snapshot: UserSettingsView }) {
  const t = useT();

  const [dmPrivacy, setDmPrivacy] = useState<DmPrivacy>(snapshot.dmPrivacy);
  const [directory, setDirectory] = useState(snapshot.discoverableDirectory);
  const [searchEngines, setSearchEngines] = useState(snapshot.discoverableSearchEngines);
  const [location, setLocation] = useState<LocationGranularity>(snapshot.locationGranularity);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await apiPatch('/api/me/settings', {
        dmPrivacy,
        discoverableDirectory: directory,
        discoverableSearchEngines: searchEngines,
        locationGranularity: location,
      });
      setSaved(true);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="xidig-form" onSubmit={onSubmit}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {saved ? <Banner kind="notice">{t('settings.saved')}</Banner> : null}

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="privacy-dm">
          {t('settings.dmPrivacyLabel')}
        </label>
        <select
          id="privacy-dm"
          className="xidig-field__input"
          value={dmPrivacy}
          onChange={(e) => setDmPrivacy(e.target.value as DmPrivacy)}
        >
          {DM_PRIVACY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(DM_PRIVACY_LABELS[option])}
            </option>
          ))}
        </select>
        <p className="xidig-field__hint">{t('settings.dmPrivacyHint')}</p>
      </div>

      <label className="xidig-checkbox">
        <input
          type="checkbox"
          checked={directory}
          onChange={(e) => setDirectory(e.target.checked)}
        />
        <span>{t('settings.discoverableDirectory')}</span>
      </label>

      <label className="xidig-checkbox">
        <input
          type="checkbox"
          checked={searchEngines}
          onChange={(e) => setSearchEngines(e.target.checked)}
        />
        <span>{t('settings.discoverableSearchEngines')}</span>
      </label>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="privacy-location">
          {t('settings.locationGranularityLabel')}
        </label>
        <select
          id="privacy-location"
          className="xidig-field__input"
          value={location}
          onChange={(e) => setLocation(e.target.value as LocationGranularity)}
        >
          {LOCATION_GRANULARITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(LOCATION_LABELS[option])}
            </option>
          ))}
        </select>
        <p className="xidig-field__hint">{t('settings.locationGranularityHint')}</p>
      </div>

      <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
        {t('action.save')}
      </button>
    </form>
  );
}
