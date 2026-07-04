import { en, type MessageKey } from './dictionaries/en';
import { so } from './dictionaries/so';
import { formatNumber } from './format';
import { FALLBACK_LOCALE, type Locale } from './locales';
import { isPluralMessage, type Message } from './messages';

export type { MessageKey };

/** Values interpolated into `{param}` placeholders. Numbers are locale-formatted. */
export type TranslateParams = Readonly<Record<string, string | number>>;

export type Translator = (key: MessageKey, params?: TranslateParams) => string;

type PartialDictionary = Readonly<Partial<Record<MessageKey, Message>>>;

const dictionaries: Record<Locale, PartialDictionary> = { en, so };

function warnDev(message: string): void {
  // NODE_ENV is inlined by Next.js in browser bundles and always present in Node.
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] ${message}`);
  }
}

function selectPluralCategory(count: number, locale: Locale): 'one' | 'other' {
  try {
    return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
  } catch {
    // Environments without CLDR data for the locale: English/Somali both
    // reduce to the n === 1 rule.
    return count === 1 ? 'one' : 'other';
  }
}

function interpolate(
  template: string,
  params: TranslateParams | undefined,
  locale: Locale,
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      warnDev(`missing param "${name}" for template "${template}"`);
      return placeholder;
    }
    return typeof value === 'number' ? formatNumber(value, locale) : value;
  });
}

/**
 * Resolve one message against a primary and a fallback dictionary.
 * @internal Exported for tests; application code uses createTranslator().
 */
export function translateWith(
  locale: Locale,
  primary: PartialDictionary,
  fallback: PartialDictionary,
  key: MessageKey,
  params?: TranslateParams,
): string {
  const message = primary[key] ?? fallback[key];
  if (message === undefined) {
    // Unreachable for statically-typed keys; guards dynamically-built ones.
    warnDev(`unknown message key "${key}"`);
    return key;
  }

  let template: string;
  if (isPluralMessage(message)) {
    const count = Number(params?.count);
    if (!Number.isFinite(count)) {
      warnDev(`plural message "${key}" translated without a numeric "count" param`);
      template = message.other;
    } else {
      template = message[selectPluralCategory(count, locale)];
    }
  } else {
    template = message;
  }

  return interpolate(template, params, locale);
}

/**
 * Build the `t(key, params)` helper for a locale.
 *
 * Resolution order: the locale's own dictionary → the English dictionary of
 * record → the key itself (never a missing-string error). Somali-first with
 * graceful English fallback, per PRD §22.
 */
export function createTranslator(locale: Locale): Translator {
  const primary = dictionaries[locale];
  const fallback = dictionaries[FALLBACK_LOCALE];
  return (key, params) => translateWith(locale, primary, fallback, key, params);
}
