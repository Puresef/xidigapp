'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { LANES } from '@/lib/lanes';
import { Avatar } from '../media/avatar';
import { PlainErrorBanner } from '../auth/plain-error';
import { OPEN_TO_KEYS, OPEN_TO_SLUGS } from '../profile/open-to';
import { emptyPeopleKey } from './directory-empty';
import { LoadingFlap } from '@/components/loading-flap';

/**
 * People directory (§18): free-text transliteration-tolerant search (the API
 * folds Maxamed/Mohamed server-side) + skill/lane/country/city/"open to"
 * filters. Explicit search submit + "load more" — no as-you-type requests
 * (§22 low-bandwidth: every request is one the member asked for).
 *
 * Phase 4.5: avatar thumbs in cards (96px pipeline, <8KB; 0-byte initials
 * disc when the member has none) + the `openTo` chip filter. The API already
 * excludes members who opted out of the directory.
 */

interface ProfileRow {
  user_id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  location_city: string | null;
  location_country: string | null;
  skills: string[];
  lanes: string[];
  verification_status: string;
  created_at: string;
  avatar_thumb_url: string | null;
  avatar_blurhash: string | null;
}

interface ProfilePage {
  profiles: ProfileRow[];
  nextCursor: string | null;
}

export function PeopleDirectory() {
  const t = useT();
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const [lane, setLane] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [openTo, setOpenTo] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  // The filter set that produced the current result list. Load-more pages
  // THESE, not whatever the member has since typed — otherwise a new term
  // appended under an old cursor yields an incoherent mixed list.
  const [applied, setApplied] = useState('');

  const fetchPage = useCallback(async (base: string, cursor: string | null) => {
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams(base);
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      const page = await apiGet<ProfilePage>(`/api/profiles${qs ? `?${qs}` : ''}`);
      setRows((current) => (cursor ? [...current, ...page.profiles] : page.profiles));
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }, []);

  function currentFilters(): string {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (skill.trim()) params.set('skill', skill.trim());
    if (lane) params.set('lane', lane);
    if (country.trim()) params.set('country', country.trim());
    if (city.trim()) params.set('city', city.trim());
    if (openTo) params.set('openTo', openTo);
    if (verifiedOnly) params.set('verification', 'verified');
    return params.toString();
  }

  // First page on mount only — later fetches are explicit (search / load-more).
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (booted) return;
    setBooted(true);
    void fetchPage('', null);
  }, [booted, fetchPage]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const base = currentFilters();
    setApplied(base);
    void fetchPage(base, null);
  }

  return (
    <div>
      <form className="xidig-toolbar" onSubmit={onSubmit}>
        <div className="xidig-field xidig-field--grow">
          <label className="xidig-field__label" htmlFor="people-q">
            {t('action.search')}
          </label>
          <input
            id="people-q"
            className="xidig-field__input"
            placeholder={t('suuq.searchPeoplePlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="people-skill">
            {t('suuq.filterSkill')}
          </label>
          <input
            id="people-skill"
            className="xidig-field__input"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="people-lane">
            {t('suuq.filterLane')}
          </label>
          <select
            id="people-lane"
            className="xidig-field__input"
            value={lane}
            onChange={(e) => setLane(e.target.value)}
          >
            <option value="">{t('suuq.anyOption')}</option>
            {LANES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="people-country">
            {t('suuq.filterCountry')}
          </label>
          <input
            id="people-country"
            className="xidig-field__input"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="people-city">
            {t('suuq.filterCity')}
          </label>
          <input
            id="people-city"
            className="xidig-field__input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="people-open-to">
            {t('suuq.filterOpenTo')}
          </label>
          <select
            id="people-open-to"
            className="xidig-field__input"
            value={openTo}
            onChange={(e) => setOpenTo(e.target.value)}
          >
            <option value="">{t('suuq.anyOption')}</option>
            {OPEN_TO_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {OPEN_TO_KEYS[slug] ? t(OPEN_TO_KEYS[slug]!) : slug}
              </option>
            ))}
          </select>
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="people-verified">
            {t('suuq.filterVerified')}
          </label>
          <select
            id="people-verified"
            className="xidig-field__input"
            value={verifiedOnly ? 'verified' : ''}
            onChange={(e) => setVerifiedOnly(e.target.value === 'verified')}
          >
            <option value="">{t('suuq.anyOption')}</option>
            <option value="verified">{t('suuq.filterVerifiedOption')}</option>
          </select>
        </div>
        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {t('action.search')}
        </button>
      </form>

      {error ? <PlainErrorBanner error={error} /> : null}
      {!loaded && pending ? <LoadingFlap /> : null}
      {loaded && rows.length === 0 && !error ? (
        <p className="xidig-card__meta">{t(emptyPeopleKey(applied))}</p>
      ) : null}

      <ul className="xidig-card-grid">
        {rows.map((profile) => (
          <li key={profile.user_id} className="xidig-card">
            <div className="xidig-suggest-card__identity">
              <Avatar
                name={profile.display_name}
                handle={profile.handle}
                src={profile.avatar_thumb_url}
                blurhash={profile.avatar_blurhash}
                size={40}
              />
              <div>
                <h3 className="xidig-card__title">
                  <Link href={`/u/${profile.handle}`}>{profile.display_name}</Link>
                </h3>
                <p className="xidig-card__meta">@{profile.handle}</p>
              </div>
            </div>
            {profile.location_city || profile.location_country ? (
              <p className="xidig-card__meta">
                {[profile.location_city, profile.location_country].filter(Boolean).join(', ')}
              </p>
            ) : null}
            {profile.bio ? <p className="xidig-card__body">{profile.bio}</p> : null}
            {profile.skills.length > 0 || profile.lanes.length > 0 ? (
              <p className="xidig-chip-row">
                {[...profile.lanes, ...profile.skills].slice(0, 6).map((chip) => (
                  <span key={chip} className="xidig-tag">
                    {chip}
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {nextCursor ? (
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void fetchPage(applied, nextCursor)}
          >
            {t('action.loadMore')}
          </button>
        </p>
      ) : loaded && rows.length > 0 ? (
        <p className="xidig-card__meta">{t('state.endOfList')}</p>
      ) : null}
    </div>
  );
}
