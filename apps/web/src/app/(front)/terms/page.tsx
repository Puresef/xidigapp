import type { Metadata } from 'next';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import { frontDoorRobots } from '@/lib/seo';

/**
 * /terms — product-wide draft (docs/front-door-plan.md §3). Severable by
 * design: Capital/payments mechanics are deliberately NOT enumerated (the
 * Capital section records the intent-only posture and defers detailed terms
 * to before any financial feature ships) — preserving the protective intent
 * of the old two-document split inside the single-doc model. Legal sign-off
 * gates the domain cutover.
 */

const SECTIONS: ReadonlyArray<{ titleKey: MessageKey; bodyKey: MessageKey }> = [
  { titleKey: 'marketing.termsAccountsTitle', bodyKey: 'marketing.termsAccountsBody' },
  { titleKey: 'marketing.termsContentTitle', bodyKey: 'marketing.termsContentBody' },
  { titleKey: 'marketing.termsConductTitle', bodyKey: 'marketing.termsConductBody' },
  { titleKey: 'marketing.termsFeesTitle', bodyKey: 'marketing.termsFeesBody' },
  { titleKey: 'marketing.termsCapitalTitle', bodyKey: 'marketing.termsCapitalBody' },
  { titleKey: 'marketing.termsChangesTitle', bodyKey: 'marketing.termsChangesBody' },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const robots = frontDoorRobots();
  return {
    title: t('marketing.termsTitle'),
    alternates: { canonical: '/terms' },
    ...(robots ? { robots } : {}),
  };
}

export default async function TermsPage() {
  const t = await getT();
  return (
    <main className="xidig-front">
      <div className="xidig-front__prose">
        <section className="xidig-front__hero">
          <h1>{t('marketing.termsTitle')}</h1>
          <p className="xidig-banner xidig-banner--notice">{t('marketing.legalDraftNotice')}</p>
          <p>{t('marketing.termsIntro')}</p>
        </section>
        {SECTIONS.map((section) => (
          <section key={section.bodyKey}>
            <h2>{t(section.titleKey)}</h2>
            <p>{t(section.bodyKey)}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
