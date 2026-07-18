'use client';

import { useId } from 'react';
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
/**
 * Decorative flag chips (18 Jul): inline SVG, not emoji — Windows renders
 * flag emoji as bare letter pairs. Somali star field; simplified Union Jack
 * for English. The endonym stays the accessible label.
 */
function FlagIcon({ code }: { code: Locale }) {
  if (code === 'so') {
    return (
      <svg className="xidig-flag" viewBox="0 0 18 12" width="18" height="12" aria-hidden="true">
        <rect width="18" height="12" rx="2" fill="#4189dd" />
        <path
          d="M9 2.6l.86 2.4 2.55.06-2.03 1.55.73 2.45L9 7.6 6.89 9.06l.73-2.45-2.03-1.55 2.55-.06Z"
          fill="#fff"
        />
      </svg>
    );
  }
  // useId: the toggle renders in more than one place (account menu, settings)
  // — a static clip id would collide and break the rounded clipping.
  return <UkFlag />;
}

function UkFlag() {
  const clipId = useId();
  return (
    <svg className="xidig-flag" viewBox="0 0 18 12" width="18" height="12" aria-hidden="true">
      <clipPath id={clipId}>
        <rect width="18" height="12" rx="2" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width="18" height="12" fill="#1a3668" />
        <path d="M0 0l18 12M18 0L0 12" stroke="#fff" strokeWidth="2.6" />
        <path d="M0 0l18 12M18 0L0 12" stroke="#c8102e" strokeWidth="1" />
        <path d="M9 0v12M0 6h18" stroke="#fff" strokeWidth="4" />
        <path d="M9 0v12M0 6h18" stroke="#c8102e" strokeWidth="2.2" />
      </g>
    </svg>
  );
}

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
          aria-pressed={code === locale}
          // Visible label is the compact code; the accessible name stays the
          // full language so screen readers announce "Somali"/"English", not
          // a cryptic two-letter code.
          aria-label={LOCALE_NAMES[code]}
          title={t('language.switchHint')}
          onClick={() => switchTo(code)}
          className="xidig-language-toggle__option"
        >
          <FlagIcon code={code} />
          <span aria-hidden="true">{code}</span>
        </button>
      ))}
    </div>
  );
}
