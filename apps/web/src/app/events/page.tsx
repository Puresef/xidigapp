import type { Metadata } from 'next';
import Link from 'next/link';

import { getAuthContext } from '@/lib/auth/guards';
import { loadCreationOptions, mayCreateAnything } from '@/lib/events/authz';
import {
  listMemberEvents,
  listPublicEvents,
  type EventViewRow,
} from '@/lib/events/views';
import { getLocale, getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { formatEventStart } from '@/components/events/event-list';

export const dynamic = 'force-dynamic';

/**
 * Events index (extras item 8) — dual-mode like /u/[handle] and /l/[id]:
 *
 *   * signed-in: upcoming events the member may see (RLS), chronological —
 *     no ranking, no personalization (locked);
 *   * signed-out: PUBLIC events only via the service-role narrow projection
 *     (organic-proof filtered) — an acquisition surface with the waitlist CTA.
 *
 * Category filter tabs are plain ?category= links (a filter, never an access
 * rule — locked). Lite-friendly: text-only cards, no media.
 */

export const metadata: Metadata = { title: 'Events — Xidig' };

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

export default async function EventsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const category = typeof sp.category === 'string' ? sp.category : undefined;

  const [t, locale, categories, ctx] = await Promise.all([
    getT(),
    getLocale(),
    loadCategories(),
    getAuthContext(),
  ]);
  const blocked =
    ctx &&
    (ctx.appUser.status === 'suspended' ||
      ctx.appUser.status === 'deactivated' ||
      ctx.appUser.status === 'deleted');
  const member = ctx && !blocked ? ctx : null;

  const validCategory = categories.some((cat) => cat.slug === category) ? category : undefined;
  let items: EventViewRow[] = [];
  if (member) {
    items = await listMemberEvents(member, { category: validCategory });
  } else {
    try {
      items = await listPublicEvents({ category: validCategory });
    } catch (error) {
      // Front-door resilience rule (docs/front-door-plan.md §4): the signed-out
      // index is an acquisition surface — a failed projection degrades to the
      // teaching empty state, never a 500. Members keep the fail-loud path.
      console.error('[events] public index projection failed', error);
    }
  }

  const categoryName = (row: CategoryRow) =>
    locale === 'so' && row.name_so ? row.name_so : row.name_en;
  const nameBySlug = new Map(categories.map((row) => [row.slug, categoryName(row)]));
  const modeLabels: Record<string, string> = {
    online: t('events.modeOnline'),
    in_person: t('events.modeInPerson'),
    hybrid: t('events.modeHybrid'),
  };

  let canHost = false;
  if (member) {
    try {
      canHost = mayCreateAnything(await loadCreationOptions(member, getSupabaseAdmin()));
    } catch {
      canHost = false;
    }
  }

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('events.indexTitle')}</h1>
      <p className="xidig-card__body">
        {member ? t('events.indexIntro') : t('events.publicIndexIntro')}
      </p>

      {canHost ? (
        <p>
          <Link href="/events/new" className="xidig-button xidig-button--primary">
            {t('events.newEvent')}
          </Link>
        </p>
      ) : null}

      <nav className="xidig-toolbar" aria-label={t('events.formCategory')}>
        <Link
          href="/events"
          className={`xidig-button xidig-button--secondary${validCategory ? '' : ' xidig-button--active'}`}
        >
          {t('events.categoryAll')}
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            href={`/events?category=${cat.slug}`}
            className={`xidig-button xidig-button--secondary${validCategory === cat.slug ? ' xidig-button--active' : ''}`}
          >
            {categoryName(cat)}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="xidig-card__body">{t('events.empty')}</p>
      ) : (
        <ul className="xidig-invite-list">
          {items.map((item) => (
            <li key={item.slug} className="xidig-invite-list__item">
              <Link href={`/events/${item.slug}`}>{item.title}</Link>
              <p className="xidig-card__meta">
                {formatEventStart({ startsAt: item.starts_at, timezone: item.timezone }, locale)}
                {' · '}
                {modeLabels[item.mode] ?? item.mode}
                {' · '}
                {nameBySlug.get(item.category_id) ?? item.category_id}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!member ? (
        <section className="xidig-section">
          <p className="xidig-card__body">{t('events.signedOutNote')}</p>
          <Link href="/waitlist?from=events" className="xidig-button xidig-button--primary">
            {t('events.requestAccessCta')}
          </Link>
        </section>
      ) : null}
    </main>
  );
}
