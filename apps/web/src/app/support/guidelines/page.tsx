import { getT } from '@/lib/locale';

/**
 * Community guidelines placeholder (§19). The error.contentRemoved CTA links
 * here, so this page must exist even before the full policy ships. It stays a
 * short plain-language note — the full guidelines publish HERE once the
 * content policy is finalized and legally reviewed (docs/front-door-plan.md
 * §3; the old external xidig.net link was removed with the Phase A front
 * door, since that site is being scrapped).
 */
export default async function GuidelinesPage() {
  const t = await getT();
  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.guidelinesTitle')}</h1>
      <p>{t('settings.guidelinesBody')}</p>
    </main>
  );
}
