import type { Metadata } from 'next';
import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import { frontDoorRobots } from '@/lib/seo';

/**
 * /product — the present-tense "what you get today" tour (docs/front-door-plan
 * §3). Kept separate from /about on purpose: product description and
 * mission/manifesto blending on one URL was the old site's root identity
 * failure. Everything named here is built and live; nothing is roadmap.
 */

// Social-first order (9 Jul reframe): the casual surfaces lead, the builder
// depth follows — the same ladder the whole funnel walks.
const SECTIONS: ReadonlyArray<{ titleKey: MessageKey; bodyKey: MessageKey }> = [
  { titleKey: 'marketing.blockPlazaTitle', bodyKey: 'marketing.blockPlazaBody' },
  { titleKey: 'marketing.blockProfilesTitle', bodyKey: 'marketing.blockProfilesBody' },
  { titleKey: 'marketing.blockSuuqTitle', bodyKey: 'marketing.blockSuuqBody' },
  { titleKey: 'marketing.blockDmTitle', bodyKey: 'marketing.blockDmBody' },
  { titleKey: 'marketing.blockLabsTitle', bodyKey: 'marketing.blockLabsBody' },
  { titleKey: 'marketing.blockCapitalTitle', bodyKey: 'marketing.blockCapitalBody' },
  { titleKey: 'marketing.blockLiteTitle', bodyKey: 'marketing.blockLiteBody' },
  { titleKey: 'marketing.productTrustTitle', bodyKey: 'marketing.productTrustBody' },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const robots = frontDoorRobots();
  return {
    title: t('marketing.productTitle'),
    alternates: { canonical: '/product' },
    ...(robots ? { robots } : {}),
  };
}

export default async function ProductPage() {
  const t = await getT();
  return (
    <main className="xidig-front">
      <section className="xidig-front__hero">
        <h1>{t('marketing.productTitle')}</h1>
        <p>{t('marketing.productIntro')}</p>
      </section>
      <div className="xidig-front__grid xidig-front__grid--numbered">
        {SECTIONS.map((section) => (
          <div key={section.bodyKey} className="xidig-front-card">
            <h3>{t(section.titleKey)}</h3>
            <p>{t(section.bodyKey)}</p>
          </div>
        ))}
      </div>
      <section className="xidig-front__section xidig-front__prose xidig-front__section--center xidig-front__section--woven">
        <p>{t('marketing.productBetaNote')}</p>
        <div className="xidig-front__cta-row">
          <Link href="/waitlist?from=product" className="xidig-button xidig-button--primary">
            {t('marketing.requestAccess')}
          </Link>
        </div>
      </section>
    </main>
  );
}
