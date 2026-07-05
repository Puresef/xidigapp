/**
 * Supported UI locales. Somali is listed first deliberately: the product is
 * Somali-first (PRD §22), and this order is what locale pickers render.
 */
export const LOCALES = ['so', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Somali-first default: a brand-new visitor whose browser expresses no
 * preference between Somali and English sees Somali. Untranslated keys fall
 * back per-key to English (see FALLBACK_LOCALE), so an incomplete dictionary
 * never blocks the Somali-first default.
 */
export const DEFAULT_LOCALE: Locale = 'so';

/**
 * The dictionary of record. English keys are the source of truth for which
 * messages exist; other locales fall back to it key-by-key while their
 * coverage climbs to 100%.
 */
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * Language names shown verbatim in the toggle regardless of the active
 * locale (a Somali speaker stuck on an English UI must be able to find
 * their language), so they are constants here rather than dictionary keys.
 *
 * Naming review 5 Jul: "Somali" (short/brandable) over the strict endonym
 * "Soomaali" — shorter and instantly recognisable in both scripts' habits.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  so: 'Somali',
  en: 'English',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Pick a supported locale from an HTTP Accept-Language header value.
 * Quality-aware: entries are ranked by their `q` weight (default 1) before
 * matching on the primary subtag, so "en;q=0.5, so;q=0.9" resolves to Somali.
 * No supported match → DEFAULT_LOCALE.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const candidates = acceptLanguage
    .split(',')
    .map((entry) => {
      const [tag = '', ...paramParts] = entry.trim().split(';');
      let quality = 1;
      for (const param of paramParts) {
        const [name, value] = param.trim().split('=');
        if (name?.toLowerCase() === 'q' && value !== undefined) {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) quality = parsed;
        }
      }
      const primarySubtag = tag.trim().toLowerCase().split('-')[0] ?? '';
      return { primarySubtag, quality };
    })
    .filter((candidate) => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    if (isLocale(candidate.primarySubtag)) return candidate.primarySubtag;
  }
  return DEFAULT_LOCALE;
}
