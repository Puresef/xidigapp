import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BusinessDirectory } from '@/components/suuq/business-directory';
import { PeopleDirectory } from '@/components/suuq/people-directory';
import { getAuthContext } from '@/lib/auth/guards';
import { getCategories } from '@/lib/categories';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Suuq — Directory & Map (§18, §12: people + business listings, NOT a
 * commerce surface). Tabs are links (?tab=), not client state: the URL is
 * shareable and no JS is needed to switch. The map is its own route
 * (/suuq/map) so its tiles never load unless asked for (§22).
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
  const tab = params.tab === 'businesses' ? 'businesses' : 'people';

  const t = await getT();
  const locale = await getLocale();
  const categories = await getCategories(ctx.supabase, locale);

  return (
    <main>
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
        <Link className="xidig-tabs__tab" href="/suuq/map">
          {t('suuq.tabMap')}
        </Link>
      </div>

      {tab === 'people' ? <PeopleDirectory /> : <BusinessDirectory categories={categories} />}
    </main>
  );
}
