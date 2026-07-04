import * as Sentry from '@sentry/nextjs';

// Client-side (browser) Sentry init. Reads process.env.NEXT_PUBLIC_SENTRY_DSN
// directly — this file ships to the browser bundle, so it can't import
// src/env.ts (that validates the full server env, which isn't available
// there; see src/lib/supabase-browser.ts for the same reasoning).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  integrations: [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
