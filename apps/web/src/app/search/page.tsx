import { SearchClient, type SearchTab } from '@/components/search/search-client';
import { getAuthContext } from '@/lib/auth/guards';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Global search (Phase 4.5 DISCOVERY, extras item 3): one box across people,
 * businesses, Spaces and Plaza posts. Login-free — visitors get the public
 * projections (the API scopes each group; posts are members-only §28).
 *
 * The URL is the whole state (house pattern, same as /suuq): /search?q= runs
 * the search on load and ?type= picks the entity tab, so both are shareable
 * links rather than client-only state.
 */

const SEARCH_TABS: readonly SearchTab[] = ['all', 'people', 'listings', 'labs', 'posts'];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  const signedIn =
    ctx !== null &&
    ctx.appUser.status !== 'suspended' &&
    ctx.appUser.status !== 'deactivated' &&
    ctx.appUser.status !== 'deleted';

  const params = await searchParams;
  const initialQuery = typeof params.q === 'string' ? params.q.slice(0, 80) : '';
  const initialType: SearchTab = SEARCH_TABS.includes(params.type as SearchTab)
    ? (params.type as SearchTab)
    : 'all';

  const prefs = await getLitePrefs();
  const t = await getT();

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('search.title')}</h1>
      <p className="xidig-card__meta">{t('search.subtitle')}</p>
      <SearchClient
        initialQuery={initialQuery}
        initialType={initialType}
        prefs={prefs}
        signedIn={signedIn}
      />
    </main>
  );
}
