import { getT } from '@/lib/locale';

/**
 * Suspension appeal landing (§27). The `account_suspended` error CTA
 * (lib/errors.ts) points here; without this page every suspended member's one
 * promised resolution path 404s. Minimal by design — a real appeal workflow
 * is later-phase; today it routes to a monitored support channel. Reuses
 * existing launch-floor copy so no new Somali strings are pending.
 */
export default async function AppealPage() {
  const t = await getT();
  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('action.appeal')}</h1>
      <p>{t('error.accountSuspended')}</p>
      <p>
        <a
          href="mailto:support@xidig.app?subject=Account%20appeal"
          className="xidig-button xidig-button--primary"
        >
          {t('action.appeal')}
        </a>
      </p>
    </main>
  );
}
