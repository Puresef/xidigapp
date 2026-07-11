import './globals.css';
import './front.css';

import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { LocaleProvider } from '@xidig/i18n/react';

import { env } from '../env';
import { AppNav } from '../components/app-nav';
import { ConsentBanner } from '../components/consent/consent-banner';
import { FrontNav } from '../components/front/front-nav';
import { LanguageToggle } from '../components/language-toggle';
import { LiteAutoPrompt } from '../components/lite/lite-auto-prompt';
import { BadgeProvider } from '../components/nav/badge-provider';
import { HeaderSearch } from '../components/nav/header-search';
import { NotificationBell } from '../components/nav/notification-bell';
import { UserMenu } from '../components/nav/user-menu';
import { SiteFooter } from '../components/site-footer';
import { getHeaderViewer } from '../lib/auth/header-viewer';
import { getGeoCountry } from '../lib/capital/region-gate';
import { CONSENT_COOKIE } from '../lib/consent/model';
import { getConsentChoice } from '../lib/consent/server';
import { isLiteActive } from '../lib/lite/prefs';
import { regionSuggestsLite } from '../lib/lite/connection';
import { getLitePrefs } from '../lib/lite/server';
import { getLocale, getT } from '../lib/locale';
import { isApexDeployment } from '../lib/seo';
import {
  MOTION_COOKIE,
  parseMotion,
  parseTextSize,
  parseTheme,
  TEXTSIZE_COOKIE,
  THEME_COOKIE,
} from '../lib/settings/appearance';

/* Display face for the front-door design layer (front.css) — self-hosted at
   build time by next/font, exposed as --font-display. Body copy stays on the
   system stack. */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    // Absolute-URL base for OG images/canonicals. Flips to the apex with the
    // APP_URL env change at cutover — no code edit (docs/front-door-plan.md §3).
    metadataBase: new URL(env.APP_URL),
    title: t('app.name'),
    description: t('app.tagline'),
    // §28 WhatsApp-first growth loop: every page gets a default link-preview
    // card (og:image comes from the root opengraph-image.tsx convention);
    // entity routes (/u, /labs, /l, /c) override with their per-entity OG
    // routes. No `url` here — og:url would wrongly pin every page to the
    // apex root; canonical is set per-page where it matters.
    openGraph: {
      type: 'website',
      siteName: t('app.name'),
      title: t('app.name'),
      description: t('app.tagline'),
    },
    twitter: { card: 'summary_large_image' },
    // Env-gated indexing: everything is noindex until this deployment IS
    // xidig.net, so the old marketing site stays the sole indexed owner of
    // its URLs during the overlap (no duplicate-content window). Per-page
    // metadata (e.g. /u/[handle] member privacy) still composes on top.
    ...(isApexDeployment() ? {} : { robots: { index: false, follow: false } }),
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

  // §12 consent capture: signed-in members without a CURRENT-version choice
  // get the banner. The cookie answers without a DB read after the first
  // choice; signed-out visitors are never prompted — the front door processes
  // nothing optional for them, so there is nothing to consent to
  // (docs/consent-capture.md).
  const consent =
    viewer.signedIn && viewer.userId
      ? await getConsentChoice(viewer.userId, cookieStore.get(CONSENT_COOKIE)?.value)
      : null;

  // §22 low-bandwidth auto-prompt: the region heuristic is resolved server-side
  // from the trusted edge geo header; the client component additionally checks
  // the live connection (2G/3G/Save-Data) before offering Lite.
  const geoSuggestsLite = regionSuggestsLite(getGeoCountry({ headers: await headers() }));

  return (
    // suppressHydrationWarning: the inline script (and the appearance settings
    // page) legitimately mutate html attributes before/after hydration.
    <html
      lang={locale}
      className={spaceGrotesk.variable}
      suppressHydrationWarning
      data-textsize={textSize}
      {...(theme !== 'system' ? { 'data-theme': theme } : {})}
      {...(motionOff ? { 'data-motion': 'off' } : {})}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <LocaleProvider initialLocale={locale}>
          {/* Viewer-branched shell (docs/front-door-plan.md §2). Signed-in:
              the app chrome, with one BadgeProvider feeding both the Messages
              tab and the bell so the unread summary is fetched once
              (initialSignedIn seeds from the server so the menu doesn't
              flash). Signed-out: the front-door acquisition header — no badge
              polling, no supabase-js, no app-only client JS. */}
          {viewer.signedIn ? (
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
              <ConsentBanner needsPrompt={consent?.needsPrompt ?? false} />
            </BadgeProvider>
          ) : (
            <header className="xidig-header">
              <FrontNav />
              <div className="xidig-header__actions">
                <LanguageToggle />
                <Link href="/signin" className="xidig-button xidig-button--secondary">
                  {t('action.signIn')}
                </Link>
                <Link href="/waitlist?from=nav" className="xidig-button xidig-button--primary">
                  {t('marketing.requestAccess')}
                </Link>
              </div>
            </header>
          )}
          {children}
          <LiteAutoPrompt
            signedIn={viewer.signedIn}
            liteActive={isLiteActive(lite)}
            regionSuggestsLite={geoSuggestsLite}
          />
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
