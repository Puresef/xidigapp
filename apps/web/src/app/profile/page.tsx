import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ProfileViewCard } from '@/components/profile/profile-view-card';
import { ShareActions } from '@/components/share-actions';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getMemberProfileView } from '@/lib/profile-view';

export const dynamic = 'force-dynamic';

/**
 * Aniga — the signed-in member's own profile (nav.profile). Fixes the Seq 29
 * dead tab: no profile row yet → a friendly set-up nudge instead of a 404.
 */
export default async function OwnProfilePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/profile');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();

  // Resolve own handle first (RLS row, cheap), then reuse the shared view.
  const { data: row } = await ctx.supabase
    .from('profiles')
    .select('handle')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();

  if (!row) {
    return (
      <main className="xidig-auth">
        <h1 className="xidig-auth__title">{t('nav.profile')}</h1>
        <p>{t('profile.notSetUp')}</p>
        <p>
          <Link href="/settings/profile" className="xidig-button xidig-button--primary">
            {t('onboarding.completeProfile')} →
          </Link>
        </p>
      </main>
    );
  }

  // Own profile — pass the viewer id so the owner always sees their real
  // city/coords regardless of location_granularity (the privacy fold is for
  // OTHER members' views).
  const view = await getMemberProfileView(ctx.supabase, row.handle, ctx.appUser.id);
  if (!view) redirect('/settings/profile');

  return (
    <main>
      <ProfileViewCard
        view={view}
        viewer="owner"
        actions={
          <>
            <Link href="/settings/profile" className="xidig-button xidig-button--secondary">
              {t('action.editProfile')}
            </Link>
            <ShareActions path={`/u/${view.profile.handle}`} text={view.profile.display_name} />
          </>
        }
      />
    </main>
  );
}
