import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { ConsentPreferences } from '@/components/consent/consent-preferences';
import { DataSettings } from '@/components/settings/data-settings';
import { getAuthContext } from '@/lib/auth/guards';
import { CONSENT_COOKIE } from '@/lib/consent/model';
import { getConsentChoice } from '@/lib/consent/server';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Data & Lite mode (§22, Phase 4.5): granular Lite switches + bundles, the
 * weekly data-saved meter, data export, and the path to account
 * deactivation/deletion. The Lite cookie is the source of truth — the
 * snapshot here is the same server read every rendering page uses.
 */
export default async function DataSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings/data');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();
  const prefs = await getLitePrefs();
  // §12 privacy choices — same resolution the layout banner uses (cookie fast
  // path, consent_records fallback), so the toggles show the live state.
  const consent = await getConsentChoice(
    ctx.appUser.id,
    (await cookies()).get(CONSENT_COOKIE)?.value,
  );

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.dataTitle')}</h1>
      <ConsentPreferences
        initialAnalytics={consent.analytics}
        initialErrorMonitoring={consent.errorMonitoring}
      />
      <DataSettings initialPrefs={prefs} />
    </main>
  );
}
