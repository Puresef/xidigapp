import type { Metadata } from 'next';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import { frontDoorRobots } from '@/lib/seo';

/**
 * /privacy — product-wide draft (docs/front-door-plan.md §3). The draft
 * banner stays until legal sign-off, which gates the DOMAIN CUTOVER, not this
 * build. Verification/biometric detail is deliberately thin: the DPIA
 * (docs/dpia-verification.md) publishes before verification opens — this page
 * must not overstate or pre-empt it.
 */

const SECTIONS: ReadonlyArray<{ titleKey: MessageKey; bodyKey: MessageKey }> = [
  { titleKey: 'marketing.privacyCollectTitle', bodyKey: 'marketing.privacyCollectBody' },
  { titleKey: 'marketing.privacyUseTitle', bodyKey: 'marketing.privacyUseBody' },
  { titleKey: 'marketing.privacyAnalyticsTitle', bodyKey: 'marketing.privacyAnalyticsBody' },
  { titleKey: 'marketing.privacyVerificationTitle', bodyKey: 'marketing.privacyVerificationBody' },
  { titleKey: 'marketing.privacyRightsTitle', bodyKey: 'marketing.privacyRightsBody' },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const robots = frontDoorRobots();
  return {
    title: t('marketing.privacyTitle'),
    alternates: { canonical: '/privacy' },
    ...(robots ? { robots } : {}),
  };
}

export default async function PrivacyPage() {
  const t = await getT();
  return (
    <main className="xidig-front">
      <div className="xidig-front__prose">
        <section className="xidig-front__hero">
          <h1>{t('marketing.privacyTitle')}</h1>
          <p className="xidig-banner xidig-banner--notice">{t('marketing.legalDraftNotice')}</p>
          <p>{t('marketing.privacyIntro')}</p>
        </section>
        {SECTIONS.map((section) => (
          <section key={section.bodyKey}>
            <h2>{t(section.titleKey)}</h2>
            <p>{t(section.bodyKey)}</p>
          </section>
        ))}
        <p>{t('marketing.privacyContactBody')}</p>
      </div>
    </main>
  );
}
