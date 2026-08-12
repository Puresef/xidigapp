import type { Metadata } from 'next';
import Link from 'next/link';

import { getAuthContext } from '@/lib/auth/guards';
import { loadCreationOptions, mayCreateAnything } from '@/lib/events/authz';
import { EVENTS_INDEX_LIMIT } from '@/lib/events/constants';
import {
  eventCoverView,
  listEventCards,
  listPublicEvents,
  type EventCardItem,
  type EventViewRow,
  type EventsTab,
} from '@/lib/events/views';
import { getLitePrefs } from '@/lib/lite/server';
import { getLocale, getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { EmptyState } from '@/components/empty-state';
import { EventCard, type EventCardVariant } from '@/components/events/event-card';
import { EventsOfflineNotice } from '@/components/events/events-offline-notice';

export const dynamic = 'force-dynamic';

/**
 * Events index (frame 9a) — dual-mode like /u/[handle] and /l/[id]:
 *
 *   * signed-in: the 9a card list, one tab at a time (Soo socda · N /
 *     La qabtay / Kuwayga) — chronological, no ranking, no personalization
 *     (locked); the upcoming tab appends the recent-past strip under the
 *     "La qabtay" divider; the honesty footer states the counting rule;
 *   * signed-out: PUBLIC events only via the service-role narrow projection
 *     (organic-proof filtered) — same cards minus RSVP island and minus any
 *     count line (aggregates are floor-gated signed-out), with the waitlist
 *     CTA.
 *
 * Category filter links are plain ?category= links (a filter, never an
 * access rule — locked), kept as the quiet second row below the tabs.
 */

// Brand suffix comes from the root title.template — never inline it here.
export const metadata: Metadata = { title: 'Events' };

interface CategoryRow {
  slug: string;
  name_en: string;
  name_so: string | null;
}

async function loadCategories(): Promise<CategoryRow[]> {
  const { data } = await getSupabaseAdmin()
    .from('event_categories')
    .select('slug, name_en, name_so')
    .eq('is_active', true)
    .order('position', { ascending: true });
  return data ?? [];
}

/** Anon rows re-shaped for EventCard. No counts, no host hydration — the
 *  signed-out surface renders no aggregate below the N>=5 floor anyway. */
function publicCardItem(row: EventViewRow): EventCardItem {
  const cover = eventCoverView(row);
  return {
    slug: row.slug,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    mode: row.mode,
    venueName: row.venue_name,
    status: row.status,
    capacity: row.capacity,
    coverUrl: cover.coverUrl,
    coverThumbUrl: cover.coverThumbUrl,
    coverBlurhash: cover.coverBlurhash,
    host: null,
    goingCount: 0,
    attendedCount: null,
    attendeeSample: [],
    viewerRsvp: null,
    isPast: false,
    isFull: false,
  };
}

const cardVariant = (item: EventCardItem): EventCardVariant =>
  item.status === 'cancelled' ? 'cancelled' : item.isPast ? 'past' : 'default';

export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const category = typeof sp.category === 'string' ? sp.category : undefined;
  const tabParam = typeof sp.tab === 'string' ? sp.tab : undefined;
  const tab: EventsTab = tabParam === 'past' ? 'past' : tabParam === 'mine' ? 'mine' : 'upcoming';

  const [t, locale, categories, ctx, prefs] = await Promise.all([
    getT(),
    getLocale(),
    loadCategories(),
    getAuthContext(),
    getLitePrefs(),
  ]);
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');
  const member = ctx && !blocked ? ctx : null;

  const validCategory = categories.some((cat) => cat.slug === category) ? category : undefined;
  const categoryName = (row: CategoryRow) =>
    locale === 'so' && row.name_so ? row.name_so : row.name_en;

  let canHost = false;
  if (member) {
    try {
      canHost = mayCreateAnything(await loadCreationOptions(member, getSupabaseAdmin()));
    } catch {
      canHost = false;
    }
  }

  // ?tab= and ?category= compose — both rows keep the other's selection.
  const href = (targetTab: EventsTab, targetCategory: string | undefined) => {
    const query = new URLSearchParams();
    if (targetTab !== 'upcoming') query.set('tab', targetTab);
    if (targetCategory) query.set('category', targetCategory);
    const qs = query.toString();
    return qs ? `/events?${qs}` : '/events';
  };

  const filterRow = (
    <nav className="xidig-event-filters" aria-label={t('events.formCategory')}>
      <Link
        href={href(tab, undefined)}
        className="xidig-tag"
        aria-current={validCategory ? undefined : 'true'}
      >
        {t('events.categoryAll')}
      </Link>
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={href(tab, cat.slug)}
          className="xidig-tag"
          aria-current={validCategory === cat.slug ? 'true' : undefined}
        >
          {categoryName(cat)}
        </Link>
      ))}
    </nav>
  );

  // ── Signed-out: acquisition surface, degrade-not-500 (front-door rule) ──
  if (!member) {
    let rows: EventViewRow[] = [];
    try {
      rows = await listPublicEvents({ category: validCategory });
    } catch (error) {
      console.error('[events] public index projection failed', error);
    }
    return (
      <main className="xidig-section xidig-event-page">
        <header className="xidig-event-head">
          <h1 className="xidig-auth__title">{t('events.indexTitle')}</h1>
        </header>
        <p className="xidig-card__body">{t('events.publicIndexIntro')}</p>
        {filterRow}
        {rows.length === 0 ? (
          <EmptyState messageKey="events.empty" />
        ) : (
          <div className="xidig-event-list">
            {rows.map((row) => (
              <EventCard
                key={row.slug}
                item={publicCardItem(row)}
                prefs={prefs}
                locale={locale}
                withRsvp={false}
              />
            ))}
          </div>
        )}
        <section className="xidig-section">
          <p className="xidig-card__body">{t('events.signedOutNote')}</p>
          <Link href="/waitlist?from=events" className="xidig-button xidig-button--primary">
            {t('events.requestAccessCta')}
          </Link>
        </section>
      </main>
    );
  }

  // ── Signed-in: the 9a card list ─────────────────────────────────────────
  const { items, upcomingCount } = await listEventCards(member, tab);

  // listEventCards has no category input (Task 4's interface); the filter
  // stays an app-layer intersection: one bounded slug read, then a filter.
  let visible = items;
  if (validCategory && items.length > 0) {
    const { data } = await member.supabase
      .from('events')
      .select('slug')
      .eq('category_id', validCategory)
      .in('slug', items.map((item) => item.slug))
      .limit(EVENTS_INDEX_LIMIT * 2);
    const inCategory = new Set((data ?? []).map((row) => row.slug));
    visible = items.filter((item) => inCategory.has(item.slug));
  }

  const upcomingItems = visible.filter((item) => !item.isPast);
  const pastItems = visible.filter((item) => item.isPast);
  const showEmpty = tab === 'upcoming' ? upcomingItems.length === 0 : visible.length === 0;

  const tabs: Array<{ key: EventsTab; label: string }> = [
    { key: 'upcoming', label: t('events.tabUpcoming') },
    { key: 'past', label: t('events.tabPast') },
    { key: 'mine', label: t('events.tabMine') },
  ];

  return (
    <main className="xidig-section xidig-event-page">
      <header className="xidig-event-head">
        <h1 className="xidig-auth__title">{t('events.indexTitle')}</h1>
        {canHost ? (
          <Link
            href="/events/new"
            className="xidig-icon-button"
            aria-label={t('events.createAria')}
          >
            <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5.5v13M5.5 12h13" />
            </svg>
          </Link>
        ) : null}
      </header>

      <nav className="xidig-event-tabs" aria-label={t('events.indexTitle')}>
        {tabs.map(({ key, label }) => (
          <Link
            key={key}
            href={href(key, validCategory)}
            className="xidig-tag"
            aria-current={tab === key ? 'page' : undefined}
          >
            {label}
            {/* upcomingCount is tab-local: only the Soo-socda tab, viewed, has it. */}
            {key === 'upcoming' && tab === 'upcoming' ? (
              <span className="num">{` · ${upcomingCount}`}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {filterRow}

      <EventsOfflineNotice renderedAt={Date.now()} />

      {showEmpty ? (
        // e2 — the teaching empty state: events are born in Warshads, the
        // Suuq and community posts; create stays secondary (and only for
        // members who can actually host — authz matches the header button).
        <EmptyState
          titleKey="events.emptyTitle"
          messageKey="events.emptyBody"
          action={
            <div className="xidig-event-empty__actions">
              <Link href="/labs" className="xidig-button xidig-button--primary">
                {t('events.emptyCtaLabs')}
              </Link>
              {canHost ? (
                <Link href="/events/new" className="xidig-button xidig-button--secondary">
                  {t('events.emptyCtaCreate')}
                </Link>
              ) : null}
            </div>
          }
        />
      ) : null}

      {visible.length > 0 ? (
        <div className="xidig-event-list">
          {upcomingItems.map((item) => (
            <EventCard
              key={item.slug}
              item={item}
              prefs={prefs}
              locale={locale}
              variant={cardVariant(item)}
            />
          ))}
          {tab !== 'past' && pastItems.length > 0 ? (
            <div className="xidig-event-list__divider">
              <span>{t('events.tabPast')}</span>
            </div>
          ) : null}
          {pastItems.map((item) => (
            <EventCard
              key={item.slug}
              item={item}
              prefs={prefs}
              locale={locale}
              variant={cardVariant(item)}
            />
          ))}
          <p className="xidig-event-list__note">{t('events.honestyNote')}</p>
        </div>
      ) : null}
    </main>
  );
}
