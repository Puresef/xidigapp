'use client';

import { useRouter } from 'next/navigation';

import { LOCALE_NAMES, LOCALES, type Locale } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { persistPreferredLanguage } from '../lib/persist-language';

/**
 * Somali ⇄ English switch. Each option is an endonym (never translated) so a
 * member can always find their own language. Switching:
 *   1. re-renders client components instantly via the LocaleProvider,
 *   2. persists the choice in the locale cookie (all users) and in
 *      users.preferred_language (signed-in members, best-effort),
 *   3. soft-refreshes so server-rendered strings re-resolve — no page reload.
 */
export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const router = useRouter();

  function switchTo(next: Locale) {
    if (next === locale) return;
    setLocale(next);
    router.refresh();
    void persistPreferredLanguage(next);
  }

  return (
    <div role="group" aria-label={t('language.label')} className="xidig-language-toggle">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === locale}
          title={t('language.switchHint')}
          onClick={() => switchTo(code)}
          className="xidig-language-toggle__option"
        >
          {LOCALE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
