/**
 * Low-bandwidth mode (§22 — Phase 1 acceptance: "toggle works; disables
 * images and map tiles"). The COOKIE is the rendering source of truth so
 * server components can decide before any tiles/images are requested, and so
 * the mode works signed-out too. Signed-in members also persist the flag to
 * `users.low_bandwidth_enabled` (PATCH /api/me/bandwidth) for cross-device
 * continuity + the §23 event.
 */

export const LOW_BANDWIDTH_COOKIE = 'xidig_lowbw';

/** One year, like the locale cookie — a device preference, not a session. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function serializeLowBandwidthCookie(enabled: boolean): string {
  return `${LOW_BANDWIDTH_COOKIE}=${enabled ? '1' : '0'}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

export function parseLowBandwidthCookieValue(value: string | undefined | null): boolean {
  return value === '1';
}
