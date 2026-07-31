'use client';

import { useEffect } from 'react';

import { useT } from '@xidig/i18n/react';

/**
 * Shared route error boundary (Task 9). One boundary at the app-shell level:
 * it replaces only the failed segment's content, so the header/nav chrome
 * from the root layout stays interactive — the member keeps their bearings
 * and every escape route. global-error.tsx remains the last-resort fallback
 * for failures in the root layout itself.
 *
 * §27 plain language + a real Retry: reset() re-renders the failed segment,
 * which is genuinely worth offering here (transient fetch/RLS hiccups) —
 * unlike global-error, where Back is the honest default.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // Lazy on purpose (front-door standard §4.2, same rationale as
    // global-error.tsx): this boundary sits in every route's bundle, and a
    // static '@sentry/nextjs' import would ship the ~150KB client vendor to
    // every anonymous route. Imported DIRECTLY from node_modules — Turbopack
    // hoists dynamically-imported app-source modules into the eager chunk
    // set. This boundary now intercepts errors BEFORE global-error, so the
    // capture must happen here or route errors would go unreported (and the
    // "we've been notified" copy would lie). Signed-out visitors never ran
    // Sentry.init (instrumentation-client stub) → minimal error-only init;
    // the getClient() guard keeps a member's full init intact.
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

  return (
    <main className="xidig-section">
      <div className="xidig-section xidig-empty" role="alert">
        <h1 className="xidig-empty__title">{t('state.errorTitle')}</h1>
        {/* §27: what happened · why · what to do next */}
        <p className="xidig-card__body">{t('error.server')}</p>
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--primary"
            onClick={() => reset()}
          >
            {t('action.retry')}
          </button>
        </p>
      </div>
    </main>
  );
}
