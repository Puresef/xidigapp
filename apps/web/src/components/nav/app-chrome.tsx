'use client';

import { ConsentBanner } from '@/components/consent/consent-banner';
import { AppNav } from '@/components/app-nav';
import { BadgeProvider } from '@/components/nav/badge-provider';
import { CreateButton } from '@/components/nav/create-button';
import { HeaderSearch } from '@/components/nav/header-search';
import { KeyboardShortcuts } from '@/components/nav/keyboard-shortcuts';
import { NotificationsMenu } from '@/components/nav/notifications-menu';
import { Toaster } from '@/components/toaster';
import { UserMenu } from '@/components/nav/user-menu';
import { SentryBoot } from '@/components/sentry-boot';
import type { HeaderViewer } from '@/lib/auth/header-viewer';

/**
 * The signed-in app chrome — header (search + create + notifications + account
 * menu, all fed by one BadgeProvider) plus the consent banner.
 *
 * This module is the single dynamic-import boundary for the whole app-only
 * client surface (docs/front-door-standard.md §2-E28 / FD§2). The root layout
 * pulls it in via `next/dynamic`, so its chunk — which transitively includes
 * supabase-js through BadgeProvider/UserMenu — loads ONLY when a signed-in
 * viewer actually renders it. Anonymous front-door visitors get the marketing
 * header instead and never download this code. Keep every app-only header
 * component behind this boundary: a static import of any of them from the
 * layout would put supabase-js back in the anonymous bundle.
 *
 * A client component so the create-action label resolves via the same
 * LocaleProvider context the header's other pieces already use.
 */
export function AppChrome({
  viewer,
  consentNeedsPrompt,
}: {
  viewer: HeaderViewer;
  consentNeedsPrompt: boolean;
}) {
  return (
    <BadgeProvider initialSignedIn={viewer.signedIn}>
      {/* Client Sentry rides this chunk on purpose — signed-in only (§4.2). */}
      <SentryBoot />
      <header className="xidig-header">
        <AppNav />
        <div className="xidig-header__actions">
          <HeaderSearch />
          {/* Abuur — the create action (naming review 5 Jul): a header button,
              not a nav tab. Contextual since 18 Jul (lib/nav/create-target). */}
          <CreateButton />
          <NotificationsMenu />
          <UserMenu viewer={viewer} />
        </div>
      </header>
      <ConsentBanner needsPrompt={consentNeedsPrompt} />
      <KeyboardShortcuts />
      <Toaster />
    </BadgeProvider>
  );
}
