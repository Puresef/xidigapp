'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Component, type ReactNode } from 'react';

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

/**
 * Header-scoped error boundary (adversarial-review fix): without it, an
 * AppChrome chunk-load failure (network blip, deploy skew) throws in render
 * and escalates to global-error — replacing a member's ALREADY-RENDERED page
 * with the full-page error screen over a header-only problem. Catch it here
 * and degrade to the public nav (the page content beneath is untouched); the
 * lazy capture mirrors global-error's, best-effort because the likely cause
 * is "can't load chunks" — in which case the Sentry chunk won't load either.
 */
class ChromeBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    import('@sentry/nextjs')
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => {});
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function HeaderChrome({
  viewer,
  consentNeedsPrompt,
}: {
  viewer: HeaderViewer;
  consentNeedsPrompt: boolean;
}) {
  const t = useT();

  if (viewer.signedIn) {
    return (
      <ChromeBoundary
        fallback={
          <header className="xidig-header">
            <FrontNav />
          </header>
        }
      >
        <AppChrome viewer={viewer} consentNeedsPrompt={consentNeedsPrompt} />
      </ChromeBoundary>
    );
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
