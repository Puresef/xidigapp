import type { Metadata } from 'next';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';

/**
 * /privacy — live, indexed, founder-reviewed (blocker B1). The apex cutover is
 * done, so this is a public crawlable legal page: comprehensive plain-language
 * copy, no draft banner. The only unresolved facts are the two bracketed
 * placeholders ([XIDIG LEGAL ENTITY], [GOVERNING JURISDICTION]) surfaced in the
 * intro/contact body and the entity note. Verification/biometric detail stays
 * deliberately thin: the DPIA (docs/dpia-verification.md) publishes before
 * verification opens — this page must not overstate or pre-empt it.
 */

const SECTIONS: ReadonlyArray<{ titleKey: MessageKey; bodyKey: MessageKey }> = [
  { titleKey: 'marketing.privacyCollectTitle', bodyKey: 'marketing.privacyCollectBody' },
  { titleKey: 'marketing.privacyBasisTitle', bodyKey: 'marketing.privacyBasisBody' },
  { titleKey: 'marketing.privacyUseTitle', bodyKey: 'marketing.privacyUseBody' },
  { titleKey: 'marketing.privacyAnalyticsTitle', bodyKey: 'marketing.privacyAnalyticsBody' },
  { titleKey: 'marketing.privacyCookiesTitle', bodyKey: 'marketing.privacyCookiesBody' },
  { titleKey: 'marketing.privacyVerificationTitle', bodyKey: 'marketing.privacyVerificationBody' },
  { titleKey: 'marketing.privacyRetentionTitle', bodyKey: 'marketing.privacyRetentionBody' },
  { titleKey: 'marketing.privacyRightsTitle', bodyKey: 'marketing.privacyRightsBody' },
  { titleKey: 'marketing.privacyTransfersTitle', bodyKey: 'marketing.privacyTransfersBody' },
  { titleKey: 'marketing.privacyChildrenTitle', bodyKey: 'marketing.privacyChildrenBody' },
  { titleKey: 'marketing.privacyContactTitle', bodyKey: 'marketing.privacyContactBody' },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return frontMetadata({
    title: t('marketing.privacyTitle'),
    description: t('marketing.privacyIntro'),
    path: '/privacy',
  });
}

export default async function PrivacyPage() {
  const t = await getT();
  return (
    <main className="xidig-front">
      <div className="xidig-front__prose">
        <section className="xidig-front__hero">
          <h1>{t('marketing.privacyTitle')}</h1>
          <p>{t('marketing.privacyUpdatedNotice')}</p>
          <p>{t('marketing.privacyIntro')}</p>
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
