import type { Metadata } from 'next';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';

/**
 * /terms — live, indexed, founder-reviewed (blocker B1). Severable by design:
 * Capital/payments mechanics are deliberately NOT enumerated (the Capital
 * section records the intent-only posture and keeps the securities disclaimer
 * verbatim, deferring detailed terms to before any financial feature ships) —
 * preserving the protective intent of the old two-document split inside the
 * single-doc model. The only unresolved facts are the two bracketed
 * placeholders ([XIDIG LEGAL ENTITY], [GOVERNING JURISDICTION]).
 */

const SECTIONS: ReadonlyArray<{ titleKey: MessageKey; bodyKey: MessageKey }> = [
  { titleKey: 'marketing.termsEligibilityTitle', bodyKey: 'marketing.termsEligibilityBody' },
  { titleKey: 'marketing.termsAccountsTitle', bodyKey: 'marketing.termsAccountsBody' },
  { titleKey: 'marketing.termsContentTitle', bodyKey: 'marketing.termsContentBody' },
  { titleKey: 'marketing.termsConductTitle', bodyKey: 'marketing.termsConductBody' },
  { titleKey: 'marketing.termsFeesTitle', bodyKey: 'marketing.termsFeesBody' },
  { titleKey: 'marketing.termsCapitalTitle', bodyKey: 'marketing.termsCapitalBody' },
  { titleKey: 'marketing.termsModerationTitle', bodyKey: 'marketing.termsModerationBody' },
  { titleKey: 'marketing.termsDisclaimerTitle', bodyKey: 'marketing.termsDisclaimerBody' },
  { titleKey: 'marketing.termsChangesTitle', bodyKey: 'marketing.termsChangesBody' },
  { titleKey: 'marketing.termsGoverningTitle', bodyKey: 'marketing.termsGoverningBody' },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return frontMetadata({
    title: t('marketing.termsTitle'),
    description: t('marketing.termsIntro'),
    path: '/terms',
  });
}

export default async function TermsPage() {
  const t = await getT();
  return (
    <main className="xidig-front">
      <div className="xidig-front__prose">
        <section className="xidig-front__hero">
          <h1>{t('marketing.termsTitle')}</h1>
          <p>{t('marketing.termsUpdatedNotice')}</p>
          <p>{t('marketing.termsIntro')}</p>
        </section>
        {SECTIONS.map((section) => (
          <section key={section.bodyKey}>
            <h2>{t(section.titleKey)}</h2>
            <p>{t(section.bodyKey)}</p>
          </section>
        ))}
        <p>
          <em>{t('marketing.legalEntityNote')}</em>
        </p>
      </div>
    </main>
  );
}
