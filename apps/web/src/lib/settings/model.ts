import type { Tables } from '@xidig/db';

/**
 * user_settings domain model (§26 privacy/notification knobs + the Phase 4.5
 * `preferences` jsonb for client-shaped prefs). One shape shared by the API
 * route (GET/PATCH /api/me/settings), the settings pages (server snapshot),
 * and their client components.
 *
 * The row is created LAZILY: GET returns these defaults when no row exists;
 * the first PATCH upserts one. `preferences` holds
 * `{ lite: {...LitePrefs}, appearance: {theme,textSize,reducedMotion}, liteBundle }`
 * — cookies stay the rendering source of truth (they work signed-out); the
 * column is cross-device continuity.
 */

export const DM_PRIVACY_OPTIONS = ['everyone', 'verified', 'none'] as const;
export type DmPrivacy = (typeof DM_PRIVACY_OPTIONS)[number];

export const LOCATION_GRANULARITY_OPTIONS = ['exact', 'city', 'region', 'hidden'] as const;
export type LocationGranularity = (typeof LOCATION_GRANULARITY_OPTIONS)[number];

export const DIGEST_FREQUENCY_OPTIONS = ['weekly', 'off'] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCY_OPTIONS)[number];

export interface UserSettingsView {
  dmPrivacy: DmPrivacy;
  discoverableDirectory: boolean;
  discoverableSearchEngines: boolean;
  locationGranularity: LocationGranularity;
  /** Local hour 0–23; both null = quiet hours off. */
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  digestFrequency: DigestFrequency;
  preferences: Record<string, unknown>;
}

/** Mirrors the column DEFAULTs in 20260706300000_experience_expansion.sql. */
export const USER_SETTINGS_DEFAULTS: UserSettingsView = {
  dmPrivacy: 'everyone',
  discoverableDirectory: true,
  discoverableSearchEngines: true,
  locationGranularity: 'city',
  quietHoursStart: null,
  quietHoursEnd: null,
  digestFrequency: 'weekly',
  preferences: {},
};

function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Row → view; null row → the lazy-creation defaults. */
export function settingsViewFromRow(row: Tables<'user_settings'> | null): UserSettingsView {
  if (!row) return { ...USER_SETTINGS_DEFAULTS, preferences: {} };
  const preferences =
    typeof row.preferences === 'object' && row.preferences !== null && !Array.isArray(row.preferences)
      ? (row.preferences as Record<string, unknown>)
      : {};
  return {
    dmPrivacy: oneOf(row.dm_privacy, DM_PRIVACY_OPTIONS, USER_SETTINGS_DEFAULTS.dmPrivacy),
    discoverableDirectory: row.discoverable_directory,
    discoverableSearchEngines: row.discoverable_search_engines,
    locationGranularity: oneOf(
      row.location_granularity,
      LOCATION_GRANULARITY_OPTIONS,
      USER_SETTINGS_DEFAULTS.locationGranularity,
    ),
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    digestFrequency: oneOf(
      row.digest_frequency,
      DIGEST_FREQUENCY_OPTIONS,
      USER_SETTINGS_DEFAULTS.digestFrequency,
    ),
    preferences,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge a preferences patch into the stored jsonb: plain objects merge
 * recursively, everything else (scalars, arrays, null) overwrites. A PATCH
 * that only touches `preferences.appearance.theme` therefore never clobbers
 * `preferences.lite`.
 */
export function deepMergePreferences(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = merged[key];
    merged[key] =
      isPlainObject(current) && isPlainObject(value)
        ? deepMergePreferences(current, value)
        : value;
  }
  return merged;
}
