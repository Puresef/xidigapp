import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';

import { LanguageToggle } from '@/components/language-toggle';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Settings hub (Phase 4.5): one card per section. Language is the odd one
 * out — it is a two-option toggle, so it lives inline on its card instead of
 * behind another click (§22 the switcher is always one tap away).
 */

const SECTIONS: ReadonlyArray<{ href: string; titleKey: MessageKey; bodyKey: MessageKey }> = [
  { href: '/settings/account', titleKey: 'settings.hubAccount', bodyKey: 'settings.hubAccountBody' },
  { href: '/settings/profile', titleKey: 'settings.hubProfile', bodyKey: 'settings.hubProfileBody' },
  { href: '/settings/privacy', titleKey: 'settings.hubPrivacy', bodyKey: 'settings.hubPrivacyBody' },
  {
    href: '/settings/notifications',
    titleKey: 'settings.hubNotifications',
    bodyKey: 'settings.hubNotificationsBody',
  },
  {
    href: '/settings/appearance',
    titleKey: 'settings.hubAppearance',
    bodyKey: 'settings.hubAppearanceBody',
  },
  { href: '/settings/data', titleKey: 'settings.hubData', bodyKey: 'settings.hubDataBody' },
];

export default async function SettingsHubPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();

  return (
    <main>
      <h1 className="xidig-auth__title">{t('settings.hubTitle')}</h1>
      <ul className="xidig-card-grid">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link href={section.href} className="xidig-card xidig-settings-card">
              <h2 className="xidig-card__title">{t(section.titleKey)}</h2>
              <p className="xidig-card__meta">{t(section.bodyKey)}</p>
            </Link>
          </li>
        ))}
        <li>
          <div className="xidig-card">
            <h2 className="xidig-card__title">{t('settings.hubLanguage')}</h2>
            <p className="xidig-card__meta">{t('settings.hubLanguageBody')}</p>
            <LanguageToggle />
          </div>
        </li>
      </ul>
    </main>
  );
}
