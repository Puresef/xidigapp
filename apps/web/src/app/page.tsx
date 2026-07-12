import type { Metadata } from 'next';

import { FollowingFeedLazy } from '@/components/feed/following-feed-lazy';
import { FrontHome } from '@/components/front/front-home';
import { LabsSeekingYou } from '@/components/matching/labs-seeking-you';
import { MentorInResidence } from '@/components/mentor/mentor-in-residence';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { getAuthContext } from '@/lib/auth/guards';
import { organizationJsonLd } from '@/lib/front/org-schema';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { findLabsSeekingSkills } from '@/lib/matching/looking-for';
import { getOnboardingProgress } from '@/lib/onboarding/progress';

// Per-request: the page renders a member Home (Following feed, §13) or the
// public welcome depending on the session.
export const dynamic = 'force-dynamic';

// The apex root is the canonical home for both branches (signed-in and
// front door share the URL by design — docs/front-door-plan.md §2).
export const metadata: Metadata = { alternates: { canonical: '/' } };

// Server component: strings resolve on the server via getT(). After a
// language switch, the toggle's router.refresh() re-renders this tree in the
// new locale while client components update instantly.
export default async function HomePage() {
  const t = await getT();
  const ctx = await getAuthContext();

  if (ctx) {
    // Granular per-category Lite prefs (§22) — the feed honors images/embeds
    // per category rather than an all-or-nothing bundle.
    const [{ data: me }, prefs, progress] = await Promise.all([
      ctx.supabase.from('profiles').select('skills').eq('user_id', ctx.appUser.id).maybeSingle(),
      getLitePrefs(),
      getOnboardingProgress(ctx),
    ]);
    const labMatches = await findLabsSeekingSkills(ctx.supabase, (me?.skills ?? []) as string[]);
    return (
      <main>
        <h1 className="xidig-auth__title">{t('nav.home')}</h1>
        <OnboardingChecklist progress={progress} />
        <MentorInResidence />
        <LabsSeekingYou matches={labMatches} />
        <h2 className="xidig-section__title">{t('feed.title')}</h2>
        <FollowingFeedLazy viewerId={ctx.appUser.id} prefs={prefs} />
      </main>
    );
  }

  // Signed-out: the front-door landing (docs/front-door-plan.md §4) —
  // proof-first marketing content, not an app dashboard. The Organization
  // JSON-LD (§7 — ported old-site schema asset) rides only this public
  // branch; static data + locked i18n strings, no member input.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd({ description: t('app.tagline') })),
        }}
      />
      <FrontHome />
    </>
  );
}
