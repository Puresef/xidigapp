'use client';

import * as Sentry from '@sentry/nextjs';
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
    Sentry.captureException(error);
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
