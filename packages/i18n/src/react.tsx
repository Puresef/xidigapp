'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { serializeLocaleCookie } from './cookie';
import type { Locale } from './locales';
import { createTranslator, type Translator } from './translate';

interface LocaleContextValue {
  locale: Locale;
  /**
   * Switch the UI language. Re-renders every consumer immediately (no page
   * reload) and persists the choice in the locale cookie. Server-rendered
   * strings pick up the new cookie on the next request — callers in Next.js
   * should follow up with `router.refresh()`.
   */
  setLocale: (next: Locale) => void;
  t: Translator;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState(initialLocale);

  // The provider mounts once in the root layout and survives soft navigations,
  // so a server render that resolves a NEW locale (sign-in hydrating the
  // cookie from users.preferred_language, another tab toggling) must be
  // adopted here — otherwise client components stay in the old language until
  // a hard reload. Render-phase derived state, per React's docs; user-driven
  // setLocale still applies instantly and converges via router.refresh().
  const [lastInitialLocale, setLastInitialLocale] = useState(initialLocale);
  if (initialLocale !== lastInitialLocale) {
    setLastInitialLocale(initialLocale);
    setLocaleState(initialLocale);
  }

  // Keep assistive tech in sync however the locale changed (toggle, sign-in
  // hydration, another tab) — not only via the setLocale path.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== 'undefined') {
      document.cookie = serializeLocaleCookie(next);
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: createTranslator(locale) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (context === null) {
    throw new Error(
      'useLocale/useT must be used inside <LocaleProvider> (rendered by the root layout).',
    );
  }
  return context;
}

/** Current locale + setter, for language toggles and locale-aware widgets. */
export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void } {
  const { locale, setLocale } = useLocaleContext();
  return { locale, setLocale };
}

/** The `t(key, params)` helper bound to the active locale. */
export function useT(): Translator {
  return useLocaleContext().t;
}
