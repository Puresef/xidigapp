import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * First-session checklist stub (§20). Profile/lanes/follow/post items unlock
 * in their own Phase 1 tasks — the auth deliverable here is the
 * set-a-password item, which appears only for passwordless signups and
 * disappears the moment a password exists.
 */
export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/onboarding');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const { data: hasPassword } = await ctx.supabase.rpc('has_password');

  const items: Array<{ key: string; label: string; href: string; done: boolean }> = [
    { key: 'profile', label: t('onboarding.completeProfile'), href: '/profile', done: false },
    { key: 'lanes', label: t('onboarding.pickLanes'), href: '/profile', done: false },
    { key: 'follow', label: t('onboarding.followThree'), href: '/suuq', done: false },
    { key: 'post', label: t('onboarding.firstPost'), href: '/plaza', done: false },
  ];
  if (!hasPassword) {
    items.push({
      key: 'password',
      label: t('onboarding.setPassword'),
      href: '/settings/account',
      done: false,
    });
  }

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('onboarding.title')}</h1>
      <ul className="xidig-invite-list">
        {items.map((item) => (
          <li key={item.key} className="xidig-invite-list__item">
            <Link href={item.href}>{item.label} →</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
