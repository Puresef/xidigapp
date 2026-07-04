import { isLocale, type Locale } from './locales';

/**
 * The locale preference cookie. It is the device-level source of truth for
 * everyone (signed in or not); signed-in members additionally sync the choice
 * to `users.preferred_language` so it follows them across devices.
 */
export const LOCALE_COOKIE = 'xidig_locale';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Serialize a `document.cookie` assignment persisting the locale for a year. */
export function serializeLocaleCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
}

/**
 * Extract the locale from a cookie string — either a request `Cookie` header
 * or `document.cookie`. Returns null when absent or not a supported locale.
 */
export function parseLocaleCookie(cookieString: string | null | undefined): Locale | null {
  if (!cookieString) return null;
  for (const pair of cookieString.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;
    const name = pair.slice(0, separatorIndex).trim();
    if (name !== LOCALE_COOKIE) continue;
    const value = pair.slice(separatorIndex + 1).trim();
    if (isLocale(value)) return value;
  }
  return null;
}
