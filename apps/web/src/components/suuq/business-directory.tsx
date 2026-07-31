'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { CategoryOption } from '@/lib/categories';
import type { PlainError } from '@/lib/errors';
import { formatPriceRange, listingOpenNow } from '@/lib/listings';
import Link from 'next/link';

import type { LitePrefs } from '@/lib/lite/prefs';
import { PlainErrorBanner } from '../auth/plain-error';
import { Dialog } from '../dialog';
import { EmptyState } from '../empty-state';
import { FeedEnd } from '../feed/feed-end';
import { emptyBusinessesKey } from './directory-empty';
import { ListingCard, type ListingRow } from './listing-card';
import { MapBrowser } from './map-browser';
import { LoadingFlap } from '@/components/loading-flap';

/**
 * Business directory tab (§18) over GET /api/listings — Task 10 shape: a slim
 * sticky bar (search + city + "Filters" sheet) with LIVE filtering. Text
 * inputs debounce ~300ms; sheet selects apply immediately; Enter applies
 * immediately. This tab deliberately diverges from the people tab's
 * explicit-fetch Search button (§22) — businesses are a browse surface.
 *
 * Load-more correctness: `applied` tracks the filter set that produced the
 * current list, and every fetch carries a generation token — a response whose
 * generation is stale (a newer filter set applied while it was in flight) is
 * dropped, so a mid-flight load-more can never append old-filter rows onto a
 * new-filter list.
 *
 * Phase 4.5: "Open now" is a CLIENT-SIDE toggle over the loaded page(s) only
 * (viewer-clock computation, same v1 caveat as the detail chip) — it does not
 * change the server query, so load-more still pages the unfiltered set. The
 * filters sheet disclosed this next to the toggle (suuq.openNowClientNote).
 * Server-side open-now filtering is deferred.
 *
 * Task 12 (`view="map"`, /suuq?tab=map): the SAME filter bar + sheet drive
 * the map surface — this component keeps owning filter state (chosen over
 * lifting it to the page: the Task 10 debounce/generation machinery lives
 * here and the map only needs the applied set), but list fetching is skipped
 * and the applied filter string is passed to MapBrowser, which owns its own
 * viewport-scoped fetch (filters + bbox). `openNowOnly` passes through so
 * pins and cards stay consistent with the sheet toggle.
 */

interface ListingPage {
  listings: ListingRow[];
  nextCursor: string | null;
}

const DEBOUNCE_MS = 300;

export function BusinessDirectory({
  categories,
  view = 'list',
  prefs,
}: {
  categories: CategoryOption[];
  /** 'map' embeds MapBrowser under the shared filter bar (Task 12). */
  view?: 'list' | 'map' | undefined;
  /** Required with view='map' (MediaSlot tile deferral needs the prefs). */
  prefs?: LitePrefs | undefined;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  /** '' = any; '1'..'4' = exact price level (extras item 5). */
  const [price, setPrice] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const [rows, setRows] = useState<ListingRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  // Filter set that produced the current list; load-more pages THIS (see
  // people-directory for the rationale).
  const [applied, setApplied] = useState('');

  const categoryNames = useMemo(
    () => new Map(categories.map((option) => [option.id, option.name])),
    [categories],
  );

  /** Generation of the newest APPLIED filter set; stale responses are dropped. */
  const genRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPage = useCallback(async (base: string, cursor: string | null, gen: number) => {
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams(base);
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      const page = await apiGet<ListingPage>(`/api/listings${qs ? `?${qs}` : ''}`);
      // A newer filter set applied while this was in flight — drop it (the
      // brief's race: type → debounce fires → load-more resolves late).
      if (genRef.current !== gen) return;
      setRows((current) => (cursor ? [...current, ...page.listings] : page.listings));
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (cause) {
      if (genRef.current !== gen) return;
      // Belt-and-braces with applyNow's apply-start clear: a failed page-1
      // fetch must never leave a pageable cursor behind (load-more would mix
      // filter/sort generations). Failed load-mores keep their cursor — the
      // button doubles as the retry.
      if (!cursor) setNextCursor(null);
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      if (genRef.current === gen) setPending(false);
    }
  }, []);

  const filters = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (category) params.set('category', category);
    if (city.trim()) params.set('city', city.trim());
    if (country.trim()) params.set('country', country.trim());
    if (verifiedOnly) params.set('verification', 'verified');
    if (price) params.set('price', price);
    return params.toString();
  }, [q, category, city, country, verifiedOnly, price]);

  /**
   * Apply the CURRENT filters now: cancel any pending debounce (a timer that
   * fired later would re-reset the list under an already-applied identical
   * set — or worse, clobber a fresh load-more), bump the generation, and
   * refetch page 1. Kept in a ref so timers always call the latest closure.
   */
  function applyNow() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    genRef.current += 1;
    setApplied(filters);
    // Task 10 review finding: clear the cursor at apply-START, not only on
    // success. If the page-1 fetch fails, the old list stays on screen but
    // `applied` already points at the NEW filter set — a surviving cursor
    // would let Load more page a stale keyset (old filters, old sort) into
    // it. Success overwrites this with the fresh cursor; failure leaves the
    // list un-pageable until a retry, which is the honest state.
    setNextCursor(null);
    // Map view: MapBrowser refetches off the `applied` prop change (its fetch
    // carries the bbox this component never sees) — no list fetch here.
    if (view === 'list') void fetchPage(filters, null, genRef.current);
  }
  const applyRef = useRef(applyNow);
  useEffect(() => {
    applyRef.current = applyNow;
  });

  const [booted, setBooted] = useState(false);
  useEffect(() => {
    if (booted || view === 'map') return;
    setBooted(true);
    void fetchPage('', null, genRef.current);
  }, [booted, view, fetchPage]);

  // Live text filtering (q/city/country): debounce. Value-keyed skip guards
  // (not a bare first-run flag) so mount and no-op renders never schedule an
  // apply — including under strict-mode double effects.
  const textKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify([q, city, country]);
    if (textKeyRef.current === null) {
      textKeyRef.current = key;
      return;
    }
    if (textKeyRef.current === key) return;
    textKeyRef.current = key;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      applyRef.current();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [q, city, country]);

  // Sheet selects apply immediately (open-now is client-side — no fetch).
  const selectKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify([category, price, verifiedOnly]);
    if (selectKeyRef.current === null) {
      selectKeyRef.current = key;
      return;
    }
    if (selectKeyRef.current === key) return;
    selectKeyRef.current = key;
    applyRef.current();
  }, [category, price, verifiedOnly]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    applyRef.current();
  }

  // Count of active SHEET filters — the bar button badge ("Filters · 2").
  const activeCount =
    (category ? 1 : 0) +
    (price ? 1 : 0) +
    (verifiedOnly ? 1 : 0) +
    (country.trim() ? 1 : 0) +
    (openNowOnly ? 1 : 0);

  // Open-now runs at render time on the client (rows only exist after the
  // client-side fetch, so there is no SSR/hydration divergence to worry
  // about). Filters the LOADED results only — see the module comment.
  const visibleRows = openNowOnly ? rows.filter((row) => listingOpenNow(row.opening_hours)) : rows;
  // "Open now" only counts as a filter when it emptied a populated page —
  // mirrors emptyBusinessesKey's clientFiltered definition.
  const clientFiltered = rows.length > 0 && openNowOnly;

  return (
    <div>
      <form className="xidig-filterbar" role="search" onSubmit={onSubmit}>
        <label className="xidig-visually-hidden" htmlFor="biz-q">
          {t('action.search')}
        </label>
        <input
          id="biz-q"
          type="search"
          className="xidig-field__input xidig-filterbar__search"
          placeholder={t('suuq.searchBusinessPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="xidig-visually-hidden" htmlFor="biz-city">
          {t('suuq.filterCity')}
        </label>
        <input
          id="biz-city"
          className="xidig-field__input xidig-filterbar__city"
          placeholder={t('suuq.filterCity')}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        {/* Hidden submit keeps the implicit Enter-submits behavior alive:
            with two text fields and no submit control, browsers skip implicit
            submission entirely. tabIndex -1 keeps it out of the tab order. */}
        <button type="submit" className="xidig-visually-hidden" tabIndex={-1} aria-hidden="true">
          {t('action.search')}
        </button>
        <button
          type="button"
          className="xidig-button xidig-button--secondary xidig-filterbar__filters"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          {activeCount > 0
            ? t('suuq.filtersButtonCount', { count: activeCount })
            : t('suuq.filtersButton')}
        </button>
      </form>

      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('suuq.filtersButton')}
        presentation="sheet"
      >
        <div className="xidig-form">
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
            <label className="xidig-field__label" htmlFor="biz-price">
              {t('suuq.priceRangeLabel')}
            </label>
            <select
              id="biz-price"
              className="xidig-field__input"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            >
              <option value="">{t('suuq.anyOption')}</option>
              {[1, 2, 3, 4].map((level) => (
                <option key={level} value={String(level)}>
                  {formatPriceRange(level)}
                </option>
              ))}
            </select>
          </div>
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="biz-verified">
              {t('suuq.filterVerified')}
            </label>
            <select
              id="biz-verified"
              className="xidig-field__input"
              value={verifiedOnly ? 'verified' : ''}
              onChange={(e) => setVerifiedOnly(e.target.value === 'verified')}
            >
              <option value="">{t('suuq.anyOption')}</option>
              <option value="verified">{t('suuq.filterVerifiedOption')}</option>
            </select>
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
          <div className="xidig-field">
            <label className="xidig-checkbox" htmlFor="biz-open-now">
              <input
                id="biz-open-now"
                type="checkbox"
                checked={openNowOnly}
                onChange={(e) => setOpenNowOnly(e.target.checked)}
              />{' '}
              {t('suuq.openNowFilter')}
            </label>
            <p className="xidig-field__hint">{t('suuq.openNowClientNote')}</p>
          </div>
          <p className="xidig-modal__actions">
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              onClick={() => setSheetOpen(false)}
            >
              {t('action.close')}
            </button>
          </p>
        </div>
      </Dialog>

      {view === 'map' && prefs ? (
        <MapBrowser
          filters={applied}
          openNowOnly={openNowOnly}
          categories={categoryNames}
          prefs={prefs}
        />
      ) : (
        <>
          {error ? <PlainErrorBanner error={error} /> : null}
          {!loaded && pending ? <LoadingFlap /> : null}
          {loaded && visibleRows.length === 0 && !error ? (
            <EmptyState
              messageKey={emptyBusinessesKey(applied, clientFiltered)}
              // CTA only for the genuinely-empty browse, not filtered no-results —
              // same "filtered" definition as the message key, so copy that
              // invites adding a listing always comes WITH the button.
              action={
                applied || clientFiltered ? undefined : (
                  <Link className="xidig-button xidig-button--primary" href="/suuq/new">
                    {t('suuq.addListing')}
                  </Link>
                )
              }
            />
          ) : null}

          {/* Task 11 published sort rule (chronological honesty): the caption
          ships in the same commit as the server-side ordering it describes. */}
          {visibleRows.length > 0 ? (
            <p className="xidig-card__meta">{t('suuq.sortTransparency')}</p>
          ) : null}

          <ul className="xidig-card-grid">
            {visibleRows.map((listing) => (
              // The directory is a members-only surface (page + API both gated),
              // so the bookmark button is always live here. `bookmarked` is
              // hydrated by GET /api/listings (Task 10) — one batch query.
              <ListingCard
                key={listing.id}
                listing={listing}
                signedIn
                bookmarked={listing.bookmarked ?? false}
                categories={categoryNames}
              />
            ))}
          </ul>

          {nextCursor ? (
            <p>
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pending}
                onClick={() => void fetchPage(applied, nextCursor, genRef.current)}
              >
                {t('action.loadMore')}
              </button>
            </p>
          ) : loaded && rows.length > 0 ? (
            <FeedEnd messageKey="state.endOfList" />
          ) : null}
        </>
      )}
    </div>
  );
}
