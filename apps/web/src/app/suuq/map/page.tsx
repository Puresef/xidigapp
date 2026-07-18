import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LowBandwidthToggle } from '@/components/low-bandwidth-toggle';
import { MediaSlot } from '@/components/media/media-slot';
import { BusinessDirectory } from '@/components/suuq/business-directory';
import { MapBrowser } from '@/components/suuq/map-browser';
import { getAuthContext } from '@/lib/auth/guards';
import { getCategories } from '@/lib/categories';
import { isLiteActive } from '@/lib/lite/prefs';
import { getLitePrefs } from '@/lib/lite/server';
import { MAP_EST_BYTES } from '@/lib/lite/estimates';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Suuq map (§18). Lite mode (§22, Phase 4.5) defers instead of removing:
 * with maps deferred the list renders first and the map becomes a ~0-byte
 * MediaSlot placeholder ("Show map, ~350 KB") that mounts the Leaflet
 * browser client-side only when tapped — tiles never load uninvited, but the
 * feature is never gone.
 */
export default async function SuuqMapPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/suuq/map');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const prefs = await getLitePrefs();

  if (!prefs.maps) {
    const locale = await getLocale();
    const categories = await getCategories(ctx.supabase, locale);

    return (
      <main className="xidig-section">
        <div className="xidig-profile__header">
          <h1 className="xidig-auth__title">{t('suuq.tabMap')}</h1>
          <Link href="/suuq" className="xidig-button xidig-button--secondary">
            {t('nav.suuq')}
          </Link>
        </div>
        <BusinessDirectory categories={categories} />
        <MediaSlot
          kind="map"
          src="/suuq/map#tiles"
          alt={t('lite.mapLabel')}
          estBytes={MAP_EST_BYTES}
          prefs={prefs}
        >
          <MapBrowser />
        </MediaSlot>
        <LowBandwidthToggle initialEnabled signedIn />
      </main>
    );
  }

  return (
    <main className="xidig-section">
      <div className="xidig-profile__header">
        <h1 className="xidig-auth__title">{t('suuq.tabMap')}</h1>
        <Link href="/suuq" className="xidig-button xidig-button--secondary">
          {t('nav.suuq')}
        </Link>
      </div>
      <MapBrowser />
      <LowBandwidthToggle initialEnabled={isLiteActive(prefs)} signedIn />
    </main>
  );
}
