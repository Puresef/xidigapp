import type { Metadata } from 'next';
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
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initialLocale={locale}>
          <header className="xidig-header">
            <AppNav />
            <LanguageToggle />
          </header>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
