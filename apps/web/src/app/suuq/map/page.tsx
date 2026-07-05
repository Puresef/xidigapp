import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Banner } from '@/components/banner';
import { LowBandwidthToggle } from '@/components/low-bandwidth-toggle';
import { BusinessDirectory } from '@/components/suuq/business-directory';
import { MapBrowser } from '@/components/suuq/map-browser';
import { getAuthContext } from '@/lib/auth/guards';
import { getLowBandwidth } from '@/lib/bandwidth-server';
import { getCategories } from '@/lib/categories';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Suuq map (§18). Low-bandwidth mode swaps the tiles for the list view
 * server-side (§22 acceptance: the toggle disables map tiles — Leaflet is
 * never even mounted).
 */
export default async function SuuqMapPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/suuq/map');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const lowBandwidth = await getLowBandwidth();

  if (lowBandwidth) {
    const locale = await getLocale();
    const categories = await getCategories(ctx.supabase, locale);

    return (
      <main>
        <h1 className="xidig-auth__title">{t('suuq.tabMap')}</h1>
        <Banner kind="notice">{t('suuq.mapLowBandwidth')}</Banner>
        <LowBandwidthToggle initialEnabled signedIn />
        <BusinessDirectory categories={categories} />
      </main>
    );
  }

  return (
    <main>
      <div className="xidig-profile__header">
        <h1 className="xidig-auth__title">{t('suuq.tabMap')}</h1>
        <Link href="/suuq" className="xidig-button xidig-button--secondary">
          {t('nav.suuq')}
        </Link>
      </div>
      <MapBrowser />
      <LowBandwidthToggle initialEnabled={false} signedIn />
    </main>
  );
}
