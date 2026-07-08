import { getT } from '@/lib/locale';
import { MARKETING_LINKS } from '@/lib/external-links';

/**
 * Community guidelines stub (§19). The error.contentRemoved CTA links here, so
 * this page must exist even before the full policy ships. Minimal by design: a
 * short plain-language note plus a link out to the marketing site where the
 * complete guidelines will live (xidig.net, per the unified-experience plan).
 */
export default async function GuidelinesPage() {
  const t = await getT();
  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.guidelinesTitle')}</h1>
      <p>{t('settings.guidelinesBody')}</p>
      <p>
        <a
          href={MARKETING_LINKS.guidelines}
          className="xidig-button xidig-button--secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('settings.guidelinesLink')}
        </a>
      </p>
    </main>
  );
}
