import { redirect } from 'next/navigation';

import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getOnboardingProgress } from '@/lib/onboarding/progress';

export const dynamic = 'force-dynamic';

/**
 * First-session checklist (§20). The signup flow lands new accounts here; the
 * same checklist also rides on Home until dismissed/complete. Done-state is
 * computed live per step (profile / lanes / follow-3 / first-post), plus the
 * set-a-password item for passwordless (magic-link / OTP) signups.
 */
export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/onboarding');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const progress = await getOnboardingProgress(ctx);

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('onboarding.title')}</h1>
      {progress.allDone ? (
        <p className="xidig-card__meta">{t('onboarding.done')}</p>
      ) : (
        <OnboardingChecklist progress={{ ...progress, dismissed: false }} />
      )}
    </main>
  );
}
