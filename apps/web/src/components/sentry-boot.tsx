'use client';

import { useEffect } from 'react';

import { initSentryClient } from '@/lib/sentry-client';

/**
 * Boots the client Sentry SDK for signed-in members (front-door standard
 * §4.2). Renders nothing; mounted inside AppChrome so the SDK rides the app
 * chrome's next/dynamic chunk — which is exactly the boundary proven (§4.1
 * 8a) to never reach anonymous visitors. After init it publishes the
 * router-transition hook on the window handle the instrumentation-client.ts
 * stub forwards into.
 *
 * Tradeoff (documented, accepted): init happens after the chrome chunk loads
 * rather than in instrumentation-client's pre-hydration slot, so an error in
 * the very first moments of a signed-in page load can be missed and router
 * transitions before the chunk lands are dropped. Server-side capture
 * (instrumentation.ts) still sees SSR/API failures during that window.
 */
export function SentryBoot() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    window.__xidigSentryRouterTransition = initSentryClient();
  }, []);

  return null;
}
