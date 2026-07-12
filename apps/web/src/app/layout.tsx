import './globals.css';
import './front.css';

import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';

import { LocaleProvider } from '@xidig/i18n/react';

import { env } from '../env';
import { LiteAutoPrompt } from '../components/lite/lite-auto-prompt';
import { HeaderChrome } from '../components/nav/header-chrome';
import { SiteFooter } from '../components/site-footer';
import { getHeaderViewer } from '../lib/auth/header-viewer';
import { getGeoCountry } from '../lib/capital/region-gate';
import { CONSENT_COOKIE } from '../lib/consent/model';
import { getConsentChoice } from '../lib/consent/server';
import { isLiteActive } from '../lib/lite/prefs';
import { regionSuggestsLite } from '../lib/lite/connection';
import { getLitePrefs } from '../lib/lite/server';
import { getLocale, getT } from '../lib/locale';
import { isApexDeployment, OG_LOCALES } from '../lib/seo';
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
  const locale = await getLocale();
  const t = await getT();
  return {
    // Absolute-URL base for OG images/canonicals. Flips to the apex with the
    // APP_URL env change at cutover — no code edit (docs/front-door-plan.md §3).
    metadataBase: new URL(env.APP_URL),
    // Every page that sets a title gets the brand suffix from this template.
    // og:title does NOT inherit it — public front-door routes write their own
    // suffixed og:title via frontMetadata (lib/seo).
    title: { default: t('app.name'), template: `%s — ${t('app.name')}` },
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
      locale: OG_LOCALES[locale],
      alternateLocale: [OG_LOCALES[locale === 'so' ? 'en' : 'so']],
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
          {/* Viewer-branched shell (docs/front-door-plan.md §2). The branch
              lives in a client boundary (HeaderChrome) so the signed-in app
              chrome — and its supabase-js vendor chunk — loads via
              next/dynamic({ ssr: false }) and never reaches anonymous
              visitors. Signed-out visitors render the marketing header. */}
          <HeaderChrome viewer={viewer} consentNeedsPrompt={consent?.needsPrompt ?? false} />
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
