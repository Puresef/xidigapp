import { redirect } from 'next/navigation';

import { LowBandwidthToggle } from '@/components/low-bandwidth-toggle';
import { AccountSettings, type AccountSnapshot } from '@/components/settings/account-settings';
import { getAuthContext } from '@/lib/auth/guards';
import { getLowBandwidth } from '@/lib/bandwidth-server';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Account & sign-in settings (Phase 1 scaffold). Middleware already requires
 * a session for /settings; the guard here is the API-first belt to its
 * braces. Snapshot is server-fetched (RLS: own rows) and hydrated into the
 * client component.
 */
export default async function AccountSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings/account');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();

  const [{ data: hasPassword }, { data: invites }] = await Promise.all([
    ctx.supabase.rpc('has_password'),
    ctx.supabase
      .from('invites')
      .select('id, code, redeemed_at')
      .eq('created_by_user_id', ctx.appUser.id)
      .order('created_at', { ascending: false }),
  ]);

  const onboarding = (ctx.appUser.onboarding_state ?? {}) as Record<string, unknown>;

  const snapshot: AccountSnapshot = {
    email: ctx.appUser.email,
    emailVerified: Boolean(ctx.user.email_confirmed_at),
    phone: ctx.appUser.phone,
    phoneVerified: Boolean(ctx.user.phone_confirmed_at),
    hasPassword: Boolean(hasPassword),
    passwordNudgeDismissed: onboarding['passwordNudgeDismissed'] === true,
  };

  const lowBandwidth = await getLowBandwidth();

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.accountTitle')}</h1>
      <AccountSettings snapshot={snapshot} invites={invites ?? []} />
      <section className="xidig-section">
        <LowBandwidthToggle initialEnabled={lowBandwidth} signedIn />
      </section>
    </main>
  );
}
