import { after } from 'next/server';

import { captureServer, type CaptureOptions } from './server';
import type { AnalyticsEvent } from './events';

/**
 * Fire-and-forget emission from a route handler. Schedules the capture with
 * Next's `after()` so it runs *after* the response is sent — zero added
 * latency on the request path. Falls back to a detached promise when there is
 * no request scope (background jobs). Kept in its own module so the pure
 * capture primitives in server.ts stay free of any `next/server` dependency
 * (importable from tests and non-request code).
 */
export function emitServer(event: AnalyticsEvent, options: CaptureOptions): void {
  try {
    after(() => captureServer(event, options));
  } catch {
    void captureServer(event, options);
  }
}
