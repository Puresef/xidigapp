import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BusinessDirectory } from '@/components/suuq/business-directory';
import { PeopleDirectory } from '@/components/suuq/people-directory';
import { loadLaneCatalog } from '@/lib/aniga/lanes';
import { getAuthContext } from '@/lib/auth/guards';
import { getCategories } from '@/lib/categories';
import { getLitePrefs } from '@/lib/lite/server';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Suuq — Directory & Map (§18, §12: people + business listings, NOT a
 * commerce surface). Tabs are links (?tab=), not client state: the URL is
 * shareable and no JS is needed to switch. Task 12: the map is a tab on THIS
 * page (?tab=map) so it composes with the directory's filter bar; /suuq/map
 * 308s here. Tiles still never load uninvited — the Leaflet chunk is
 * dynamic-imported only on the map tab, and Lite defers the tiles behind a
 * MediaSlot reveal while the list keeps rendering (§22 defer-not-disable).
 */
export default async function SuuqPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/suuq');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const params = await searchParams;
  const tab = params.tab === 'businesses' ? 'businesses' : params.tab === 'map' ? 'map' : 'people';

  const t = await getT();
  const locale = await getLocale();
  const categories = await getCategories(ctx.supabase, locale);
  // Lane filter options from the lanes lookup table (localized; ops-added
  // lanes appear without a deploy) — same catalog the profile editor uses.
  const laneOptions = tab === 'people' ? await loadLaneCatalog(ctx.supabase, locale) : [];
  const prefs = tab === 'map' ? await getLitePrefs() : null;

  return (
    <main className="xidig-section">
      <div className="xidig-profile__header">
        <h1 className="xidig-auth__title">{t('nav.suuq')}</h1>
        <Link href="/suuq/new" className="xidig-button xidig-button--primary">
          {t('suuq.addListing')}
        </Link>
      </div>

      <div className="xidig-tabs">
        <Link
          className="xidig-tabs__tab"
          href="/suuq"
          aria-current={tab === 'people' ? 'page' : undefined}
        >
          {t('suuq.tabPeople')}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/suuq?tab=businesses"
          aria-current={tab === 'businesses' ? 'page' : undefined}
        >
          {t('suuq.tabBusinesses')}
        </Link>
        <Link
          className="xidig-tabs__tab"
          href="/suuq?tab=map"
          aria-current={tab === 'map' ? 'page' : undefined}
        >
          {t('suuq.tabMap')}
        </Link>
      </div>

      {tab === 'people' ? (
        <PeopleDirectory laneOptions={laneOptions} />
      ) : tab === 'map' && prefs ? (
        <BusinessDirectory categories={categories} view="map" prefs={prefs} />
      ) : (
        <BusinessDirectory categories={categories} />
      )}
    </main>
  );
}
