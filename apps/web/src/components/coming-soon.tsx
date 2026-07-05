import Link from 'next/link';

import { getT } from '../lib/locale';

/**
 * Locked-surface state for future-phase areas (Seq 29). Server component —
 * an honest "opens in a later phase" instead of fake functionality, with a
 * pointer to what IS open (the Suuq). Presentational; each locked page passes
 * its canonical name so the tab and the heading always agree.
 */
export async function ComingSoon({ title }: { title: string }) {
  const t = await getT();
  return (
    <main className="xidig-coming-soon">
      <h1 className="xidig-auth__title">{title}</h1>
      <p className="xidig-coming-soon__badge">{t('state.comingSoon')}</p>
      <p>{t('state.comingSoonBody')}</p>
      <Link href="/suuq" className="xidig-button xidig-button--secondary">
        {t('nav.suuq')} →
      </Link>
    </main>
  );
}
