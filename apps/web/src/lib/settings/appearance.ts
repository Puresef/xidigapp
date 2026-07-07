/**
 * Appearance preference model (Phase 4.5 — §22 accessibility knobs).
 *
 * Three device-level cookies drive rendering (they must work signed-out and
 * decide BEFORE any bytes paint — app/layout.tsx sets the html data attrs
 * server-side from these plus a tiny inline no-FOUC script for the
 * system-theme resolution):
 *
 *   xidig_theme    = system | light | dark   → html[data-theme]
 *   xidig_textsize = s | m | l | xl          → html[data-textsize] root font-size
 *   xidig_motion   = system | off            → html[data-motion="off"] kills animation
 *
 * Signed-in members mirror the same values into
 * user_settings.preferences.appearance ({theme, textSize, reducedMotion})
 * via PATCH /api/me/settings for cross-device continuity. Pure module —
 * safe for client and server.
 */

export const THEME_COOKIE = 'xidig_theme';
export const TEXTSIZE_COOKIE = 'xidig_textsize';
export const MOTION_COOKIE = 'xidig_motion';

export const THEME_OPTIONS = ['system', 'light', 'dark'] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];

export const TEXT_SIZE_OPTIONS = ['s', 'm', 'l', 'xl'] as const;
export type TextSizeOption = (typeof TEXT_SIZE_OPTIONS)[number];

export const MOTION_OPTIONS = ['system', 'off'] as const;
export type MotionOption = (typeof MOTION_OPTIONS)[number];

/** One year — a device preference, like the locale + Lite cookies. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseTheme(raw: string | undefined | null): ThemeOption {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function parseTextSize(raw: string | undefined | null): TextSizeOption {
  return raw === 's' || raw === 'l' || raw === 'xl' ? raw : 'm';
}

export function parseMotion(raw: string | undefined | null): MotionOption {
  return raw === 'off' ? 'off' : 'system';
}

export function serializeAppearanceCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
