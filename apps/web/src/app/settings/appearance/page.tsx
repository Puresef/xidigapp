import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import {
  MOTION_COOKIE,
  parseMotion,
  parseTextSize,
  parseTheme,
  TEXTSIZE_COOKIE,
  THEME_COOKIE,
} from '@/lib/settings/appearance';

export const dynamic = 'force-dynamic';

/**
 * Appearance settings (Phase 4.5): theme / text size / reduced motion. The
 * cookies are the source of truth (they decide the paint in app/layout.tsx);
 * the signed-in mirror to user_settings.preferences.appearance happens in
 * the client component on change.
 */
export default async function AppearanceSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings/appearance');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();

  const store = await cookies();
  const snapshot = {
    theme: parseTheme(store.get(THEME_COOKIE)?.value),
    textSize: parseTextSize(store.get(TEXTSIZE_COOKIE)?.value),
    motion: parseMotion(store.get(MOTION_COOKIE)?.value),
  };

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.appearanceTitle')}</h1>
      <p className="xidig-field__hint">{t('settings.appearanceIntro')}</p>
      <AppearanceSettings snapshot={snapshot} />
    </main>
  );
}
