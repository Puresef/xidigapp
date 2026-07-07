'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch, apiPost, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { CategoryOption } from '@/lib/categories';
import { isEmptyOpeningHours, type OpeningHours } from '@/lib/listings';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';
import type { ListingRow } from './listing-card';
import { ListingPhotosPicker, type PickedPhoto } from './listing-photos-picker';
import { ListingServicesEditor, type ServiceRow } from './listing-services-editor';
import { EMPTY_OPENING_HOURS, OpeningHoursEditor } from './opening-hours-editor';
import { PriceRangeSelect } from './price-range';

/**
 * Pin-drop listing creation (§18) + Phase 4.5 owner edit (`/l/[id]/edit`).
 * Manual pin is the PRIMARY location input (geocoding fails on Somali
 * addressing); address + landmark stay optional text. Low-bandwidth mode gets
 * manual lat/lng fields instead of tiles (§22).
 *
 * Phase 4.5 fields: photos (≤5, alt required — uploaded up front via
 * /api/media, attached to the listing via PUT /api/listings/[id]/photos on
 * save), per-day opening hours, services (≤20), price range 1–4.
 *
 * Duplicate detection (§18/§27, create only): POST without `force` → 409 with
 * a top-level `duplicates` array → render "A listing for {name} already
 * exists. Is this your business? Claim it here →" with a one-click claim per
 * *unowned* match (owned matches show only the permalink), plus "mine is
 * different — create anyway" (`force: true`).
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

/** Initial values for edit mode — built by /l/[id]/edit from the listing view. */
export interface ListingFormInitial {
  id: string;
  business_name: string;
  category_id: string;
  short_description: string | null;
  address: string | null;
  landmark: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_links: Array<{ type: string; value: string }>;
  openingHours: OpeningHours | null;
  priceRange: number | null;
  services: Array<{ name: string; priceLabel: string | null }>;
  photos: PickedPhoto[];
}

export function ListingForm({
  categories,
  lowBandwidth,
  listing,
}: {
  categories: CategoryOption[];
  lowBandwidth: boolean;
  /** Present → edit mode (PATCH + photos PUT instead of POST). */
  listing?: ListingFormInitial | undefined;
}) {
  const t = useT();
  const router = useRouter();
  const editing = listing !== undefined;

  const [businessName, setBusinessName] = useState(listing?.business_name ?? '');
  const [categoryId, setCategoryId] = useState(listing?.category_id ?? '');
  const [description, setDescription] = useState(listing?.short_description ?? '');
  const [address, setAddress] = useState(listing?.address ?? '');
  const [landmark, setLandmark] = useState(listing?.landmark ?? '');
  const [city, setCity] = useState(listing?.city ?? '');
  const [country, setCountry] = useState(listing?.country ?? '');
  const [latitude, setLatitude] = useState<number | null>(listing?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(listing?.longitude ?? null);
  // Low-bandwidth manual entry holds RAW strings so intermediate values like
  // "2." and "-0.1" survive keystrokes (a number-parsing controlled input
  // would eat the trailing dot and the lone minus). Parsed on submit.
  const [latText, setLatText] = useState(listing?.latitude?.toString() ?? '');
  const [lngText, setLngText] = useState(listing?.longitude?.toString() ?? '');
  const [contacts, setContacts] = useState<ContactRow[]>(
    listing && listing.contact_links.length > 0
      ? listing.contact_links.map((row) => ({ type: row.type, value: row.value }))
      : [{ type: 'whatsapp', value: '' }],
  );

  // Phase 4.5 fields.
  const [photos, setPhotos] = useState<PickedPhoto[]>(listing?.photos ?? []);
  const [hours, setHours] = useState<OpeningHours>(listing?.openingHours ?? EMPTY_OPENING_HOURS);
  const [priceRange, setPriceRange] = useState<number | null>(listing?.priceRange ?? null);
  const [services, setServices] = useState<ServiceRow[]>(
    (listing?.services ?? []).map((row) => ({ name: row.name, priceLabel: row.priceLabel ?? '' })),
  );

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

      const core = {
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
      };
      // All seven days empty = the editor was never really used → "not
      // provided" (null), not "closed all week".
      const extras = {
        openingHours: isEmptyOpeningHours(hours) ? null : hours,
        priceRange,
        services: services
          .filter((row) => row.name.trim())
          .map((row) => ({ name: row.name.trim(), priceLabel: row.priceLabel.trim() || null })),
      };
      const photosBody = {
        photos: photos.map((photo) => ({ mediaId: photo.mediaId, alt: photo.alt })),
      };

      if (editing) {
        await apiPatch(`/api/listings/${listing.id}`, { ...core, ...extras });
        // Always PUT — it's how removals and reordering apply.
        await apiPut(`/api/listings/${listing.id}/photos`, photosBody);
        router.push(`/l/${listing.id}`);
        router.refresh();
        return;
      }

      const { listing: created } = await apiPost<{ listing: ListingRow }>('/api/listings', {
        ...core,
        ...extras,
        force,
      });
      if (photos.length > 0) {
        // Best-effort: the listing already exists — a photo-attach hiccup
        // must not strand the member on the form. They can re-add photos from
        // /l/[id]/edit.
        try {
          await apiPut(`/api/listings/${created.id}/photos`, photosBody);
        } catch {
          // Swallowed on purpose (see above).
        }
      }
      router.push(`/l/${created.id}`);
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

      <ListingPhotosPicker value={photos} onChange={setPhotos} />

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

      <OpeningHoursEditor value={hours} onChange={setHours} />

      <ListingServicesEditor value={services} onChange={setServices} />

      <PriceRangeSelect id="listing-price-range" value={priceRange} onChange={setPriceRange} />

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
        {editing ? t('suuq.saveListing') : t('suuq.addListing')}
      </button>
    </form>
  );
}
