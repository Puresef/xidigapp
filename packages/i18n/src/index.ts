// Core, React-free entry point. Safe to import from server components, API
// routes, scripts, and (later) the React Native app. React bindings live in
// '@xidig/i18n/react'.

export {
  LOCALES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_NAMES,
  isLocale,
  negotiateLocale,
  type Locale,
} from './locales';
export { LOCALE_COOKIE, serializeLocaleCookie, parseLocaleCookie } from './cookie';
export type { Message, PluralMessage } from './messages';
export {
  createTranslator,
  type MessageKey,
  type TranslateParams,
  type Translator,
} from './translate';
export { formatNumber, formatDate, formatRelativeTime } from './format';
export {
  getCoverageReport,
  formatCoverageReport,
  LAUNCH_FLOOR_NAMESPACES,
  type CoverageReport,
  type NamespaceCoverage,
} from './coverage';
