import { redirect } from 'next/navigation';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { SuggestedFollows } from '@/components/profile/suggested-follows';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getOnboardingProgress } from '@/lib/onboarding/progress';

export const dynamic = 'force-dynamic';

/**
 * First-session checklist (§20). The signup flow lands new accounts here; the
 * same checklist also rides on Home until dismissed/complete. Done-state is
 * computed live per step (profile / lanes / follow-3 / first-post), plus the
 * set-a-password item for passwordless (magic-link / OTP) signups.
 *
 * Below the checklist: interest-based follow suggestions (extras plan item 4)
 * — the "follow 3" rung with people/Labs matched on declared fields only,
 * each carrying its visible reason. Sparse declared data shows the
 * invite-your-people card instead of filler.
 */
export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/onboarding');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const progress = await getOnboardingProgress(ctx);

  return (
    <main className="xidig-auth">
      {/* Warm entry surface (mark-redesign §4): the controlled brand mark — the
          interim 🦋 marker in its color-safe form, never the raw emoji — assembles
          once above the welcome title. Decorative: the h1 carries the name. */}
      <p className="xidig-auth__mark">
        <AnimatedMark mode="assemble" size={44} />
      </p>
      <h1 className="xidig-auth__title">{t('onboarding.title')}</h1>
      {progress.allDone ? (
        <p className="xidig-card__meta">{t('onboarding.done')}</p>
      ) : (
        <OnboardingChecklist progress={{ ...progress, dismissed: false }} />
      )}
      <SuggestedFollows showLabs showEmptyState />
    </main>
  );
}
