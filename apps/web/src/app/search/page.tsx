import { SearchClient } from '@/components/search/search-client';
import { getAuthContext } from '@/lib/auth/guards';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Global search (Phase 4.5 DISCOVERY): one box across people, businesses,
 * Spaces and Plaza posts. Login-free — visitors get the public projections
 * (the API scopes each group; posts are members-only §28). A shared
 * /search?q= link runs the search on load.
 */
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

  const prefs = await getLitePrefs();
  const t = await getT();

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('search.title')}</h1>
      <p className="xidig-card__meta">{t('search.subtitle')}</p>
      <SearchClient initialQuery={initialQuery} prefs={prefs} signedIn={signedIn} />
    </main>
  );
}
