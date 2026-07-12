'use client';

import { useEffect, useState } from 'react';

import { createTranslator, DEFAULT_LOCALE, parseLocaleCookie, type Locale } from '@xidig/i18n';

/**
 * Last-resort error screen. It replaces the root layout, so there is no
 * LocaleProvider here — the locale is read straight from the cookie after
 * mount (starting from the Somali-first default keeps hydration consistent
 * when this renders during SSR, where no cookie is readable).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    // Lazy on purpose (front-door standard §4.2): a static '@sentry/nextjs'
    // import here would ship the ~150KB client vendor to every anonymous
    // route — this error boundary is in every page's bundle. Imported
    // DIRECTLY from node_modules (not via an app-source wrapper): Turbopack
    // hoists dynamically-imported app-source modules into the eager chunk
    // set, which would drag the vendor right back in. The chunk is fetched
    // only when a fatal error actually renders; losing the report on a failed
    // chunk load is acceptable, blanking the error screen is not (so the
    // screen itself never depends on the import). Signed-out visitors never
    // ran Sentry.init (instrumentation-client stub), so do a minimal
    // error-only init at capture time — captureException without a client is
    // a silent no-op; the getClient() guard keeps a signed-in member's full
    // init (traces/replay) intact.
    import('@sentry/nextjs')
      .then((Sentry) => {
        if (!Sentry.getClient()) {
          Sentry.init({
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            tracesSampleRate: 0,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            enableLogs: false,
          });
        }
        Sentry.captureException(error);
      })
      .catch(() => {});
  }, [error]);

  useEffect(() => {
    const fromCookie = parseLocaleCookie(document.cookie);
    if (fromCookie) setLocale(fromCookie);
  }, []);

  const t = createTranslator(locale);

  return (
    <html lang={locale}>
      <body>
        <main className="xidig-global-error">
          <h1>{t('app.name')}</h1>
          {/* §27 plain language: what happened · why · what to do next */}
          <p>{t('error.server')}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {t('action.retry')}
          </button>
        </main>
      </body>
    </html>
  );
}
