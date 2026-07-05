import './globals.css';

import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { LocaleProvider } from '@xidig/i18n/react';

import { AppNav } from '../components/app-nav';
import { LanguageToggle } from '../components/language-toggle';
import { getLocale, getT } from '../lib/locale';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('app.name'),
    description: t('app.tagline'),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getT();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initialLocale={locale}>
          <header className="xidig-header">
            <AppNav />
            <div className="xidig-header__actions">
              {/* Abuur — the create action (naming review 5 Jul): a header
                  button, not a nav tab. Phase 1's only creatable is a Suuq
                  listing; later phases route it by context. */}
              <Link href="/suuq/new" className="xidig-button xidig-button--primary">
                {t('action.abuur')}
              </Link>
              <LanguageToggle />
            </div>
          </header>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
