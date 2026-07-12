import * as Sentry from '@sentry/nextjs';

/**
 * The REAL browser Sentry setup (front-door standard §4.2 + Warya's 12 Jul
 * ruling: signed-in gets full client Sentry; signed-out front-door visitors
 * must not download the client vendor; server-side capture is untouched).
 *
 * This module is statically imported ONLY by SentryBoot, which mounts inside
 * AppChrome — the next/dynamic client boundary that loads exclusively for
 * signed-in viewers (§4.1 8a). That placement is what keeps the SDK out of
 * the anonymous bundle; measured under Turbopack (Next 16), every other
 * lazy-load shape from the instrumentation-client entry was hoisted eagerly
 * onto all routes. Do not import this from any module outside the AppChrome
 * graph — and never from instrumentation-client.ts.
 *
 * (global-error.tsx intentionally does NOT use this module: it lazy-imports
 * '@sentry/nextjs' directly on the fatal-error path, which measured lazy.)
 *
 * Reads process.env.NEXT_PUBLIC_SENTRY_DSN as a literal property access — this
 * ships to the browser, so it can't import src/env.ts (see supabase-browser.ts
 * for the same reasoning).
 */

declare global {
  interface Window {
    /**
     * Router-transition hook published after init for the
     * instrumentation-client.ts stub to forward into. Window-global on
     * purpose: the stub is a separate bundler entry and must not import this
     * module (see the stub's header comment).
     */
    __xidigSentryRouterTransition?: (href: string, navigationType: string) => void;
    /**
     * Pre-init error buffer set by the instrumentation-client.ts stub for
     * signed-in page loads (errors/rejections fired before the AppChrome
     * chunk lands would otherwise be lost). Drained + detached by
     * initSentryClient below.
     */
    __xidigSentryEarlyErrors?: { errors: unknown[]; detach: () => void };
  }
}

let initialized = false;

/**
 * Full signed-in init: error capture + traces, plus session replay when the
 * member holds a Supabase session AND has granted error-monitoring consent
 * (§12; e=1 in the client-readable xidig_consent cookie — fail-closed,
 * mirroring lib/analytics/consent.ts). Returns the router-transition hook for
 * SentryBoot to publish. Idempotent — AppChrome remounts must not re-init.
 */
export function initSentryClient(): (href: string, navigationType: string) => void {
  if (!initialized) {
    initialized = true;

    // Session replay is signed-in + consent only (docs/front-door-plan.md §6).
    // SentryBoot only mounts for a server-verified signed-in viewer, but
    // re-check the cookie so this function stays safe for any future caller.
    const hasSession =
      typeof document !== 'undefined' &&
      /(?:^|;\s*)sb-[^=]*-auth-token[^=]*=/.test(document.cookie);

    // Next's cookie serializer percent-encodes the value, so decode before
    // checking the flag. No cookie, junk, or e≠1 all mean no replay.
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
      // Loads the replay chunk lazily (Sentry CDN) after init instead of
      // shipping it in the static bundle; errors are non-fatal — replay is
      // best-effort.
      Sentry.lazyLoadIntegration('replayIntegration')
        .then((replayIntegration) => {
          Sentry.addIntegration(replayIntegration());
        })
        .catch(() => {});
    }

    // Replay errors the stub buffered before this init ran (the hydration +
    // chrome-chunk window), then detach its listeners — the SDK's own global
    // handlers own the page from here.
    const early = window.__xidigSentryEarlyErrors;
    if (early) {
      early.detach();
      delete window.__xidigSentryEarlyErrors;
      for (const buffered of early.errors) {
        Sentry.captureException(buffered);
      }
    }
  }

  return Sentry.captureRouterTransitionStart;
}
