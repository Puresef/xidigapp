// Server-side locale resolution. Client components get the locale from
// <LocaleProvider> (see @xidig/i18n/react) instead of these helpers.

import { cookies, headers } from 'next/headers';

import {
  createTranslator,
  isLocale,
  LOCALE_COOKIE,
  negotiateLocale,
  type Locale,
  type Translator,
} from '@xidig/i18n';

/**
 * Resolve the request locale, Somali-first:
 *   1. the xidig_locale cookie (set by the language toggle; on sign-in the
 *      auth flow will hydrate it from users.preferred_language),
 *   2. Accept-Language negotiation between Somali and English,
 *   3. Somali.
 *
 * Reading cookies() opts the route into dynamic rendering — expected for a
 * signed-in, per-user app.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  const headerStore = await headers();
  return negotiateLocale(headerStore.get('accept-language'));
}

/** `t(key, params)` bound to the request locale, for server components. */
export async function getT(): Promise<Translator> {
  return createTranslator(await getLocale());
}
