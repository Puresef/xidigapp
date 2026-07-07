import { redirect } from 'next/navigation';

import { NotificationSettings } from '@/components/settings/notification-settings';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import {
  buildPrefsMatrix,
  WEEKLY_DIGEST_TYPE,
  type PrefOverrideRow,
} from '@/lib/notifications/prefs';
import { settingsViewFromRow } from '@/lib/settings/model';

export const dynamic = 'force-dynamic';

/**
 * Notification settings (§26 matrix + quiet hours + digest). The merged
 * matrix is built server-side from the member's override rows (RLS: own
 * select); the weekly digest row is excluded — its own frequency select
 * (user_settings.digest_frequency) is the §26 weekly/off control.
 */
export default async function NotificationSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings/notifications');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();

  const [{ data: overrides }, { data: settingsRow }] = await Promise.all([
    ctx.supabase.from('notification_prefs').select('notification_type, channel, enabled'),
    ctx.supabase.from('user_settings').select('*').eq('user_id', ctx.appUser.id).maybeSingle(),
  ]);

  const matrix = buildPrefsMatrix((overrides ?? []) as PrefOverrideRow[]).filter(
    (row) => row.type !== WEEKLY_DIGEST_TYPE,
  );
  const settings = settingsViewFromRow(settingsRow ?? null);

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.notificationsTitle')}</h1>
      <p className="xidig-field__hint">{t('settings.notificationsIntro')}</p>
      <NotificationSettings
        snapshot={{
          matrix,
          quietHoursStart: settings.quietHoursStart,
          quietHoursEnd: settings.quietHoursEnd,
          digestFrequency: settings.digestFrequency,
        }}
      />
    </main>
  );
}
