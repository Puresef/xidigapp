'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { CategoryOption } from '@/lib/categories';
import type { PlainError } from '@/lib/errors';
import { PlainErrorBanner } from '../auth/plain-error';
import { ListingCard, type ListingRow } from './listing-card';

/**
 * Business directory tab (§18): q + category + city/country filters over
 * GET /api/listings. Same explicit-fetch discipline as the people tab (§22).
 */

interface ListingPage {
  listings: ListingRow[];
  nextCursor: string | null;
}

export function BusinessDirectory({ categories }: { categories: CategoryOption[] }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');

  const [rows, setRows] = useState<ListingRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  // Filter set that produced the current list; load-more pages THIS (see
  // people-directory for the rationale).
  const [applied, setApplied] = useState('');

  const fetchPage = useCallback(async (base: string, cursor: string | null) => {
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams(base);
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      const page = await apiGet<ListingPage>(`/api/listings${qs ? `?${qs}` : ''}`);
      setRows((current) => (cursor ? [...current, ...page.listings] : page.listings));
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
    if (category) params.set('category', category);
    if (city.trim()) params.set('city', city.trim());
    if (country.trim()) params.set('country', country.trim());
    return params.toString();
  }

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
          <label className="xidig-field__label" htmlFor="biz-q">
            {t('action.search')}
          </label>
          <input
            id="biz-q"
            className="xidig-field__input"
            placeholder={t('suuq.searchBusinessPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="biz-category">
            {t('suuq.filterCategory')}
          </label>
          <select
            id="biz-category"
            className="xidig-field__input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t('suuq.anyOption')}</option>
            {categories.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="biz-city">
            {t('suuq.filterCity')}
          </label>
          <input
            id="biz-city"
            className="xidig-field__input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="biz-country">
            {t('suuq.filterCountry')}
          </label>
          <input
            id="biz-country"
            className="xidig-field__input"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {t('action.search')}
        </button>
      </form>

      {error ? <PlainErrorBanner error={error} /> : null}
      {!loaded && pending ? <p className="xidig-card__meta">{t('state.loading')}</p> : null}
      {loaded && rows.length === 0 && !error ? (
        <p className="xidig-card__meta">{t('suuq.noResults')}</p>
      ) : null}

      <ul className="xidig-card-grid">
        {rows.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
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
