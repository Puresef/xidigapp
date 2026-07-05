import { redirect } from 'next/navigation';

import { ProfileForm, type ProfileSnapshot } from '@/components/profile/profile-form';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { PROFILE_MEMBER_COLUMNS } from '@/lib/profile-view';

// Per-request auth + own-profile snapshot.
export const dynamic = 'force-dynamic';

/**
 * Profile editor (§10 fields save; §20 complete-profile step). Lives at
 * /settings/profile — the exact href the §27 `profile_incomplete` CTA has
 * pointed at since the error catalog shipped. Creating and editing are the
 * same PUT (upsert semantics in /api/me/profile).
 */
export default async function ProfileSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings/profile');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select(PROFILE_MEMBER_COLUMNS)
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('action.editProfile')}</h1>
      <ProfileForm snapshot={(profile as unknown as ProfileSnapshot | null) ?? null} />
    </main>
  );
}
