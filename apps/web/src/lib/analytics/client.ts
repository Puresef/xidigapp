import { isClientEventName, type AnalyticsEventMap, type ClientAnalyticsEventName } from './events';

/**
 * Client-side analytics for the handful of events a browser originates
 * (§23 map_view / listing_view / contact_click, plus the low-bandwidth and
 * language toggles). No PostHog JS SDK: events POST to our own
 * `/api/analytics` route, which resolves the session, enforces the no-PII
 * rule server-side, and forwards to PostHog. One guard, one dependency-free
 * path, and the publishable analytics key never ships to the browser.
 *
 * Uses `navigator.sendBeacon` when available (survives page unload — right
 * for `map_view`/`contact_click` on navigation) and falls back to a keepalive
 * fetch. Always fire-and-forget: tracking never blocks a user interaction.
 */

const ANON_STORAGE_KEY = 'xidig_anon_id';

/**
 * READ-ONLY legacy anonymous id. This used to mint-and-persist a UUID on
 * first touch, which planted a persistent identifier on signed-out visitors
 * before any consent existed — while the server dropped their events at the
 * consent gate anyway (/api/analytics). Front-door rule (docs/front-door-plan
 * §5): anonymous visitors carry NO identifiers. So: return an id only if one
 * already exists from the legacy behavior; never create one. Revisit if an
 * anonymous cookie-consent mechanism ever ships (§12).
 */
function anonymousId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(ANON_STORAGE_KEY) ?? undefined;
  } catch {
    // Private mode / storage disabled.
    return undefined;
  }
}

export function trackClient<K extends ClientAnalyticsEventName>(
  name: K,
  properties: AnalyticsEventMap[K],
): void {
  if (typeof window === 'undefined') return;
  if (!isClientEventName(name)) return;

  const payload = JSON.stringify({ name, properties, anonymousId: anonymousId() });

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon('/api/analytics', blob)) return;
    }
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Best-effort — a failed beacon must never interrupt the user.
  }
}
