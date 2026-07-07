/**
 * Lite mode ("Xawli yar", §22 — Phase 4.5) preference model.
 *
 * Governing principle: Lite is a DELIVERY constraint, not a scope constraint.
 * Heavy bytes are deferred behind an explicit tap, never removed as features
 * — every image/embed/map still renders as a ~0-byte placeholder with a
 * "Show / Muuji" button (see components/media/media-slot.tsx).
 *
 * The COOKIE is the rendering source of truth (works signed-out, decides
 * before any bytes move); signed-in members mirror prefs into
 * user_settings.preferences.lite via the settings API for cross-device
 * continuity. Pure module — safe for client and server (server read lives in
 * lib/lite/server.ts).
 */

/** Per-category switches. `true` = LOAD normally; `false` = defer behind a tap. */
export interface LitePrefs {
  images: boolean;
  embeds: boolean;
  maps: boolean;
  animations: boolean;
  /** In Lite: `true` = tiny avatar thumbs (<8KB) still load; `false` = initials only. */
  smallAvatars: boolean;
}

export const LITE_PREF_KEYS = [
  'images',
  'embeds',
  'maps',
  'animations',
  'smallAvatars',
] as const satisfies readonly (keyof LitePrefs)[];

/** Bundle shortcuts (Settings → Data & Lite mode; the legacy toggle uses two of them). */
export const LITE_BUNDLES = {
  /** Text only: every heavy category deferred, avatars are initials. */
  text: { images: false, embeds: false, maps: false, animations: false, smallAvatars: false },
  /** The default Lite experience — everything deferred but tiny avatars stay. */
  essentials: { images: false, embeds: false, maps: false, animations: false, smallAvatars: true },
  /** Not Lite: load everything normally. */
  everything: { images: true, embeds: true, maps: true, animations: true, smallAvatars: true },
} as const satisfies Record<string, LitePrefs>;

export type LiteBundleName = keyof typeof LITE_BUNDLES;

/** JSON-encoded LitePrefs. Absent → legacy xidig_lowbw mapping, then `everything`. */
export const LITE_COOKIE = 'xidig_lite';

/** One year, like the locale + low-bandwidth cookies — a device preference. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Lite is "active" the moment ANY category is deferred. */
export function isLiteActive(prefs: LitePrefs): boolean {
  return LITE_PREF_KEYS.some((key) => !prefs[key]);
}

/** The bundle these prefs exactly match, if any (for the Settings shortcuts UI). */
export function matchLiteBundle(prefs: LitePrefs): LiteBundleName | null {
  for (const [name, bundle] of Object.entries(LITE_BUNDLES) as [LiteBundleName, LitePrefs][]) {
    if (LITE_PREF_KEYS.every((key) => bundle[key] === prefs[key])) return name;
  }
  return null;
}

/**
 * Parse an untrusted cookie value. Strict: every key must be present and
 * boolean, otherwise null (caller falls back to legacy cookie / everything)
 * — a half-shaped cookie must never half-apply.
 */
export function parseLitePrefs(raw: string | undefined | null): LitePrefs | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    try {
      value = JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const prefs: Partial<LitePrefs> = {};
  for (const key of LITE_PREF_KEYS) {
    if (typeof record[key] !== 'boolean') return null;
    prefs[key] = record[key];
  }
  return prefs as LitePrefs;
}

export function serializeLitePrefsCookie(prefs: LitePrefs): string {
  const value = encodeURIComponent(JSON.stringify(prefs));
  return `${LITE_COOKIE}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
