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
        {/* Self-contained styles: global-error replaces the root layout, so app
            CSS (globals.css / tokens) is NOT guaranteed to load here. */}
        <style>{GLOBAL_ERROR_CSS}</style>
        <main className="xidig-global-error">
          <div className="xidig-global-error__card">
            <p className="xidig-global-error__brand">{t('app.name')}</p>
            {/* §27 plain language: what happened · why · what to do next */}
            <h1 className="xidig-global-error__title">{t('error.server')}</h1>
            <div className="xidig-global-error__actions">
              {/* Back is the sensible default (a retry usually just re-hits the
                  same failing page); Home is the no-history / new-tab escape. */}
              <button
                type="button"
                className="xidig-global-error__btn"
                onClick={() => window.history.back()}
              >
                {t('action.back')}
              </button>
              <a className="xidig-global-error__link" href="/">
                {t('nav.home')}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}

/** Brand-adjacent, dependency-free styling for the last-resort screen. */
const GLOBAL_ERROR_CSS = `
  body { margin: 0; }
  .xidig-global-error {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 2rem 1.25rem;
    background: #ffffff;
    color: #16233f;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .xidig-global-error__card { width: 100%; max-width: 30rem; text-align: center; }
  .xidig-global-error__brand {
    margin: 0 0 0.75rem;
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #16233f;
  }
  .xidig-global-error__title {
    margin: 0 0 1.75rem;
    font-size: 1.0625rem;
    font-weight: 400;
    line-height: 1.6;
    color: #4a5568;
  }
  .xidig-global-error__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }
  .xidig-global-error__btn,
  .xidig-global-error__link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0 1.25rem;
    border-radius: 0.5rem;
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  /* Brand accent (--x-accent #2e78b0 — tokens don't load here, so inlined).
     AA: white on #2e78b0 = 4.75:1; white on hover #276a9e = 5.77:1. */
  .xidig-global-error__btn {
    border: 1px solid #2e78b0;
    background: #2e78b0;
    color: #ffffff;
  }
  .xidig-global-error__btn:hover { background: #276a9e; border-color: #276a9e; }
  .xidig-global-error__link {
    border: 1px solid #d3d9e6;
    background: #ffffff;
    color: #16233f;
  }
  .xidig-global-error__link:hover { background: #f4f6fb; border-color: #b9c2d6; }
  .xidig-global-error__btn:focus-visible,
  .xidig-global-error__link:focus-visible {
    outline: 2px solid #2e78b0;
    outline-offset: 2px;
  }
  @media (prefers-color-scheme: dark) {
    .xidig-global-error { background: #0f1729; color: #e6ebf5; }
    .xidig-global-error__brand { color: #f4f6fb; }
    .xidig-global-error__title { color: #a9b4cc; }
    .xidig-global-error__link { background: #0f1729; color: #e6ebf5; border-color: #2a3652; }
    .xidig-global-error__link:hover { background: #172136; border-color: #3a4568; }
  }
`;
