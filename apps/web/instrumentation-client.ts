import * as Sentry from '@sentry/nextjs';

// Client-side (browser) Sentry init. Reads process.env.NEXT_PUBLIC_SENTRY_DSN
// directly — this file ships to the browser bundle, so it can't import
// src/env.ts (that validates the full server env, which isn't available
// there; see src/lib/supabase-browser.ts for the same reasoning).
//
// Session replay is signed-in only and lazy (docs/front-door-plan.md §6):
// statically bundling replayIntegration added ~70-100KB gz for EVERY visitor,
// blowing the front door's low-bandwidth budget for anonymous traffic that
// never needed replay. Signed-in detection is cookie-presence only (the
// Supabase auth cookie), which is exactly the signal the shell branches on.
const hasSession =
  typeof document !== 'undefined' && /(?:^|;\s*)sb-[^=]*-auth-token[^=]*=/.test(document.cookie);

// Session replay additionally requires explicit error-monitoring consent
// (§12): the xidig_consent cookie (set by POST /api/me/consent; client-
// readable by design) must carry e=1. Parsed inline — this file ships to the
// browser and must not import server code. Next's cookie serializer percent-
// encodes the value, so decode before checking the flag. No cookie, junk, or
// e≠1 all mean no replay (fail-closed, mirroring lib/analytics/consent.ts).
// Basic error capture and traces stay on — they are essential operation.
const consentRaw =
  typeof document !== 'undefined'
    ? /(?:^|;\s*)xidig_consent=([^;]*)/.exec(document.cookie)?.[1]
    : undefined;
let hasReplayConsent = false;
if (consentRaw) {
  try {
    hasReplayConsent = /(?:^|&)e=1(?:&|$)/.test(decodeURIComponent(consentRaw));
  } catch {
    hasReplayConsent = false;
  }
}
const replayEnabled = hasSession && hasReplayConsent;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysSessionSampleRate: replayEnabled ? 0.1 : 0,
  replaysOnErrorSampleRate: replayEnabled ? 1.0 : 0,
  enableLogs: true,
});

if (replayEnabled && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // Loads the replay chunk lazily (Sentry CDN) after init instead of shipping
  // it in the static bundle; errors are non-fatal — replay is best-effort.
  Sentry.lazyLoadIntegration('replayIntegration')
    .then((replayIntegration) => {
      Sentry.addIntegration(replayIntegration());
    })
    .catch(() => {});
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
