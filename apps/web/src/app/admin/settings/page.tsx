import { redirect } from 'next/navigation';

import { BetaSettings, type WaitlistEntry } from '@/components/admin/beta-settings';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Admin → beta gating. Role enforcement is API-first (§26): this page gate
 * mirrors the requireRole('admin') checks that every /api/admin route makes
 * — UI hiding alone is never the control.
 */
export default async function AdminSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/admin/settings');
  if (ctx.appUser.role !== 'admin' || ctx.appUser.status !== 'active') redirect('/');

  const t = await getT();
  const admin = getSupabaseAdmin();

  const [{ data: mode }, { data: entries }] = await Promise.all([
    admin.rpc('get_signup_mode'),
    admin
      .from('waitlist_entries')
      .select('id, email, phone, status, created_at')
      .order('created_at', { ascending: true })
      .limit(200),
  ]);

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">
        {t('admin.title')} · {t('admin.betaTitle')}
      </h1>
      <BetaSettings
        initialMode={mode === 'waitlist' ? 'waitlist' : 'invite_only'}
        entries={(entries ?? []) as WaitlistEntry[]}
      />
    </main>
  );
}
