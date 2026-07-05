'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { CategoryOption } from '@/lib/categories';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';
import type { ListingRow } from './listing-card';

/**
 * Pin-drop listing creation (§18). Manual pin is the PRIMARY location input
 * (geocoding fails on Somali addressing); address + landmark stay optional
 * text. Low-bandwidth mode gets manual lat/lng fields instead of tiles (§22).
 *
 * Duplicate detection (§18/§27): POST without `force` → 409 with a top-level
 * `duplicates` array → render "A listing for {name} already exists. Is this
 * your business? Claim it here →" with a one-click claim per *unowned* match
 * (owned matches show only the permalink), plus "mine is different — create
 * anyway" (`force: true`).
 */

const ListingsMap = dynamic(() => import('./listings-map'), { ssr: false });

const CONTACT_TYPES = ['whatsapp', 'phone', 'email', 'website', 'facebook', 'instagram'] as const;

interface ContactRow {
  type: string;
  value: string;
}

interface DuplicateMatch {
  id: string;
  business_name: string;
  city: string | null;
  // False when the match is already owned — claiming it would 42501 on RLS,
  // so the client shows only the /l/[id] link for those (§18).
  claimable: boolean;
}

export function ListingForm({
  categories,
  lowBandwidth,
}: {
  categories: CategoryOption[];
  lowBandwidth: boolean;
}) {
  const t = useT();
  const router = useRouter();

  const [businessName, setBusinessName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  // Low-bandwidth manual entry holds RAW strings so intermediate values like
  // "2." and "-0.1" survive keystrokes (a number-parsing controlled input
  // would eat the trailing dot and the lone minus). Parsed on submit.
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([{ type: 'whatsapp', value: '' }]);

  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [claimedId, setClaimedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function setContact(index: number, patch: Partial<ContactRow>) {
    setContacts((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function submit(force: boolean) {
    setPending(true);
    setError(null);
    setNotice(null);
    if (force) setDuplicates([]);
    try {
      // In low-bandwidth mode the map is absent — parse the manual fields
      // here. Empty → null; unparseable/out-of-range → null (server also
      // validates ±90/±180).
      const parseCoord = (text: string, bound: number): number | null => {
        const trimmed = text.trim();
        if (!trimmed) return null;
        const n = Number.parseFloat(trimmed);
        return Number.isFinite(n) && Math.abs(n) <= bound ? n : null;
      };
      const lat = lowBandwidth ? parseCoord(latText, 90) : latitude;
      const lng = lowBandwidth ? parseCoord(lngText, 180) : longitude;

      const { listing } = await apiPost<{ listing: ListingRow }>('/api/listings', {
        business_name: businessName.trim(),
        category_id: categoryId,
        short_description: description.trim() || null,
        address: address.trim() || null,
        landmark: landmark.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        latitude: lat,
        longitude: lng,
        contact_links: contacts
          .filter((row) => row.value.trim())
          .map((row) => ({ type: row.type, value: row.value.trim() })),
        force,
      });
      router.push(`/l/${listing.id}`);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) {
        const body = cause.body as { duplicates?: DuplicateMatch[] } | undefined;
        if (cause.plain.code === 'duplicate_listing' && Array.isArray(body?.duplicates)) {
          setDuplicates(body.duplicates);
        } else {
          setError(cause.plain);
        }
      } else {
        setError({ code: 'server_error', message: '' });
      }
    } finally {
      setPending(false);
    }
  }

  async function claim(listingId: string) {
    setPending(true);
    setError(null);
    try {
      await apiPost(`/api/listings/${listingId}/claims`);
      setClaimedId(listingId);
      setNotice(t('suuq.claimSubmitted'));
      setDuplicates([]);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(false);
  }

  const pinSet = latitude !== null && longitude !== null;

  return (
    <form className="xidig-form" onSubmit={onSubmit}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? (
        <div>
          <Banner kind="notice">{notice}</Banner>
          {claimedId ? (
            <p>
              <Link href={`/l/${claimedId}`}>{t('suuq.claimListing')} →</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {duplicates.length > 0 ? (
        <section className="xidig-section" aria-live="polite">
          <h2 className="xidig-section__title">{t('suuq.duplicatesTitle')}</h2>
          <ul className="xidig-invite-list">
            {duplicates.map((match) => (
              <li key={match.id} className="xidig-invite-list__item">
                <span>
                  <Link href={`/l/${match.id}`}>{match.business_name}</Link>
                  {match.city ? ` — ${match.city}` : ''}
                </span>
                {match.claimable ? (
                  <button
                    type="button"
                    className="xidig-button xidig-button--secondary"
                    disabled={pending}
                    onClick={() => void claim(match.id)}
                  >
                    {t('suuq.claimListing')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="xidig-card__meta">
            {t('suuq.duplicatesBody', { name: businessName.trim() })}
          </p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void submit(true)}
          >
            {t('suuq.createAnyway')}
          </button>
        </section>
      ) : null}

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="listing-name">
          {t('suuq.businessNameLabel')}
        </label>
        <input
          id="listing-name"
          className="xidig-field__input"
          required
          maxLength={160}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="listing-category">
          {t('suuq.categoryLabel')}
        </label>
        <select
          id="listing-category"
          className="xidig-field__input"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="" disabled hidden />
          {categories.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="listing-description">
          {t('suuq.descriptionLabel')}
        </label>
        <textarea
          id="listing-description"
          className="xidig-field__input"
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <fieldset className="xidig-field">
        <legend className="xidig-field__label">{t('suuq.pinLabel')}</legend>
        {lowBandwidth ? (
          <div>
            <p className="xidig-field__hint">{t('suuq.manualCoords')}</p>
            <div className="xidig-row-editor__row">
              <input
                className="xidig-field__input"
                aria-label={t('suuq.latLabel')}
                inputMode="decimal"
                value={latText}
                onChange={(e) => setLatText(e.target.value)}
              />
              <input
                className="xidig-field__input"
                aria-label={t('suuq.lngLabel')}
                inputMode="decimal"
                value={lngText}
                onChange={(e) => setLngText(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <ListingsMap
            mode="pick"
            onPick={(lat, lng) => {
              setLatitude(Number(lat.toFixed(6)));
              setLongitude(Number(lng.toFixed(6)));
            }}
          />
        )}
        <p className="xidig-field__hint">
          {pinSet
            ? t('suuq.pinPlaced', { lat: String(latitude), lng: String(longitude) })
            : t('suuq.pinHint')}
        </p>
      </fieldset>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="listing-address">
          {t('suuq.addressLabel')}
        </label>
        <input
          id="listing-address"
          className="xidig-field__input"
          maxLength={300}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="listing-landmark">
          {t('suuq.landmarkLabel')}
        </label>
        <input
          id="listing-landmark"
          className="xidig-field__input"
          maxLength={200}
          value={landmark}
          onChange={(e) => setLandmark(e.target.value)}
        />
        <p className="xidig-field__hint">{t('suuq.landmarkHint')}</p>
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="listing-city">
          {t('suuq.filterCity')}
        </label>
        <input
          id="listing-city"
          className="xidig-field__input"
          maxLength={120}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor="listing-country">
          {t('suuq.filterCountry')}
        </label>
        <input
          id="listing-country"
          className="xidig-field__input"
          maxLength={120}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </div>

      <fieldset className="xidig-field">
        <legend className="xidig-field__label">{t('suuq.contactLinksLabel')}</legend>
        <div className="xidig-row-editor">
          {contacts.map((row, index) => (
            <div key={index} className="xidig-row-editor__row">
              <select
                className="xidig-field__input"
                aria-label={t('suuq.contactTypeLabel')}
                value={row.type}
                onChange={(e) => setContact(index, { type: e.target.value })}
              >
                {CONTACT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                className="xidig-field__input"
                aria-label={t('suuq.contactValueLabel')}
                maxLength={300}
                value={row.value}
                onChange={(e) => setContact(index, { value: e.target.value })}
              />
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                aria-label={t('a11y.removeRow')}
                onClick={() => setContacts((current) => current.filter((_, i) => i !== index))}
              >
                {t('action.remove')}
              </button>
            </div>
          ))}
          {contacts.length < 15 ? (
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              onClick={() =>
                setContacts((current) => [...current, { type: 'whatsapp', value: '' }])
              }
            >
              {t('action.add')}
            </button>
          ) : null}
        </div>
      </fieldset>

      <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
        {t('suuq.addListing')}
      </button>
    </form>
  );
}
