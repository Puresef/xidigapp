'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

import { useT } from '@xidig/i18n/react';

import { FrontNav } from '@/components/front/front-nav';
import { LanguageToggle } from '@/components/language-toggle';
import type { HeaderViewer } from '@/lib/auth/header-viewer';

/**
 * Viewer-branched header (docs/front-door-plan.md §2). This is a CLIENT
 * boundary on purpose: the `next/dynamic` for the signed-in AppChrome must
 * live in a Client Component. Measured under Turbopack (Next 16): the SAME
 * `next/dynamic({ ssr: true })` call hoists AppChrome's supabase-js vendor
 * chunk onto every anonymous route when written in a Server Component (the
 * root layout), but keeps it fully lazy from here — loaded only when a
 * signed-in viewer actually renders it. `ssr: true` (kept explicit against a
 * "simplify me" edit that would drop it) preserves the member header's
 * server render, so members see no header flash; signed-out visitors render
 * the marketing header and never download supabase-js. Do NOT move this
 * dynamic() back up into the Server Component layout.
 */
const AppChrome = dynamic(
  () => import('@/components/nav/app-chrome').then((m) => m.AppChrome),
  { ssr: true },
);

export function HeaderChrome({
  viewer,
  consentNeedsPrompt,
}: {
  viewer: HeaderViewer;
  consentNeedsPrompt: boolean;
}) {
  const t = useT();

  if (viewer.signedIn) {
    return <AppChrome viewer={viewer} consentNeedsPrompt={consentNeedsPrompt} />;
  }

  return (
    <header className="xidig-header">
      <FrontNav />
      <div className="xidig-header__actions">
        <LanguageToggle />
        <Link href="/signin" className="xidig-button xidig-button--secondary">
          {t('action.signIn')}
        </Link>
        <Link href="/waitlist?from=nav" className="xidig-button xidig-button--primary">
          {t('marketing.requestAccess')}
        </Link>
      </div>
    </header>
  );
}
