import { redirect } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';

import { BlockedList } from '@/components/settings/blocked-list';
import { PrivacySettings } from '@/components/settings/privacy-settings';
import { MutedList } from '@/components/social/muted-list';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { settingsViewFromRow } from '@/lib/settings/model';

export const dynamic = 'force-dynamic';

/** The §13 report taxonomy, browsable (same labels the report form uses). */
const REPORT_REASON_KEYS: readonly MessageKey[] = [
  'messages.reportReasonSpam',
  'messages.reportReasonHarassment',
  'messages.reportReasonImpersonation',
  'messages.reportReasonFraud',
  'messages.reportReasonInappropriate',
  'messages.reportReasonMisinfo',
  'messages.reportReasonOther',
];

/**
 * Privacy & Safety (Phase 4.5, §26): DM privacy, discoverability, location
 * granularity, blocked members, muted users/tags, and the report-reason
 * taxonomy. Snapshot is server-read under the caller's RLS; every write goes
 * through the API.
 */
export default async function PrivacySettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/settings/privacy');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');
  if (ctx.appUser.status === 'deactivated' || ctx.appUser.status === 'deleted') redirect('/');

  const t = await getT();

  const { data: row } = await ctx.supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.privacyTitle')}</h1>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('settings.privacyControls')}</h2>
        <PrivacySettings snapshot={settingsViewFromRow(row ?? null)} />
      </section>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('settings.blockedTitle')}</h2>
        <p className="xidig-field__hint">{t('settings.blockedIntro')}</p>
        <BlockedList />
      </section>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('settings.mutedTitle')}</h2>
        <p className="xidig-field__hint">{t('settings.mutedIntro')}</p>
        <MutedList />
      </section>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('settings.reportInfoTitle')}</h2>
        <p className="xidig-field__hint">{t('settings.reportInfoBody')}</p>
        <ul className="xidig-chip-row">
          {REPORT_REASON_KEYS.map((key) => (
            <li key={key} className="xidig-tag">
              {t(key)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
