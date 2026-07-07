import './globals.css';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { LocaleProvider } from '@xidig/i18n/react';

import { AppNav } from '../components/app-nav';
import { BadgeProvider } from '../components/nav/badge-provider';
import { HeaderSearch } from '../components/nav/header-search';
import { NotificationBell } from '../components/nav/notification-bell';
import { UserMenu } from '../components/nav/user-menu';
import { getHeaderViewer } from '../lib/auth/header-viewer';
import { getLitePrefs } from '../lib/lite/server';
import { getLocale, getT } from '../lib/locale';
import {
  MOTION_COOKIE,
  parseMotion,
  parseTextSize,
  parseTheme,
  TEXTSIZE_COOKIE,
  THEME_COOKIE,
} from '../lib/settings/appearance';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('app.name'),
    description: t('app.tagline'),
  };
}

/**
 * No-FOUC theme resolution (Settings → Appearance). The server already sets
 * html[data-theme] for an explicit light/dark cookie; this inline script only
 * resolves 'system' (cookie absent or =system) against prefers-color-scheme
 * before first paint, so a dark-OS visitor never flashes a light page.
 * Text size + motion are plain cookie reads, fully server-rendered — no
 * script needed for them.
 */
const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )xidig_theme=([^;]+)/);var v=m?decodeURIComponent(m[1]):'system';if(v!=='dark'&&v!=='light'){v=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',v);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getT();

  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const textSize = parseTextSize(cookieStore.get(TEXTSIZE_COOKIE)?.value);
  // data-motion is 'off' when EITHER the Appearance reduced-motion control or
  // the Lite animations pref asks for it — the Lite "animations: off" toggle
  // (bundle or granular) must actually stop animations, not just the
  // Appearance switch (§22 MEDIA-CORE).
  const motion = parseMotion(cookieStore.get(MOTION_COOKIE)?.value);
  const lite = await getLitePrefs();
  const motionOff = motion === 'off' || !lite.animations;

  const viewer = await getHeaderViewer();

  return (
    // suppressHydrationWarning: the inline script (and the appearance settings
    // page) legitimately mutate html attributes before/after hydration.
    <html
      lang={locale}
      suppressHydrationWarning
      data-textsize={textSize}
      {...(theme !== 'system' ? { 'data-theme': theme } : {})}
      {...(motionOff ? { 'data-motion': 'off' } : {})}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <LocaleProvider initialLocale={locale}>
          {/* One BadgeProvider feeds both the Messages tab and the bell so the
              unread summary is fetched once. initialSignedIn seeds from the
              server so the menu doesn't flash. */}
          <BadgeProvider initialSignedIn={viewer.signedIn}>
            <header className="xidig-header">
              <AppNav />
              <div className="xidig-header__actions">
                <HeaderSearch />
                {/* Abuur — the create action (naming review 5 Jul): a header
                    button, not a nav tab. */}
                <Link href="/suuq/new" className="xidig-button xidig-button--primary">
                  {t('action.abuur')}
                </Link>
                <NotificationBell />
                <UserMenu viewer={viewer} />
              </div>
            </header>
          </BadgeProvider>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
