import type { Metadata } from 'next';
import Link from 'next/link';

import type { MessageKey } from '@xidig/i18n';

import { getT } from '@/lib/locale';
import { frontMetadata } from '@/lib/seo';

import { FrontMotion } from '@/components/front/front-motion';
import {
  buildVignetteLabels,
  Vignette,
  type VignetteKind,
} from '@/components/front/vignettes';

/**
 * /product — the present-tense "what you get today" tour (docs/front-door-plan
 * §3). Kept separate from /about on purpose: product description and
 * mission/manifesto blending on one URL was the old site's root identity
 * failure. Everything named here is built and live; nothing is roadmap.
 *
 * Motion v2: each card reuses the homepage's schematic vignette (lighter
 * treatment — compact, in-card, no star-path). The trust card stays plain:
 * verification badges are earned, not illustrated.
 */

// Social-first order (9 Jul reframe): the casual surfaces lead, the builder
// depth follows — the same ladder the whole funnel walks.
const SECTIONS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
  vignette: VignetteKind | null;
}> = [
  { titleKey: 'marketing.blockPlazaTitle', bodyKey: 'marketing.blockPlazaBody', vignette: 'feed' },
  {
    titleKey: 'marketing.blockProfilesTitle',
    bodyKey: 'marketing.blockProfilesBody',
    vignette: 'profile',
  },
  { titleKey: 'marketing.blockSuuqTitle', bodyKey: 'marketing.blockSuuqBody', vignette: 'suuq' },
  { titleKey: 'marketing.blockDmTitle', bodyKey: 'marketing.blockDmBody', vignette: 'dm' },
  { titleKey: 'marketing.blockLabsTitle', bodyKey: 'marketing.blockLabsBody', vignette: 'labs' },
  {
    titleKey: 'marketing.blockCapitalTitle',
    bodyKey: 'marketing.blockCapitalBody',
    vignette: 'capital',
  },
  { titleKey: 'marketing.blockLiteTitle', bodyKey: 'marketing.blockLiteBody', vignette: 'lite' },
  { titleKey: 'marketing.productTrustTitle', bodyKey: 'marketing.productTrustBody', vignette: null },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return frontMetadata({
    // productTitle already names the brand ("What Xidig gives you today") —
    // skip the suffix so "Xidig" doesn't render twice.
    title: t('marketing.productTitle'),
    // productIntro says "Everything below…" — deictic copy that reads wrong in
    // a SERP snippet, so the description is its own key (standard §2 F35).
    description: t('marketing.productDescription'),
    path: '/product',
    brandInTitle: true,
  });
}

export default async function ProductPage() {
  const t = await getT();
  const vigLabels = buildVignetteLabels(t);
  return (
    <main className="xidig-front">
      <FrontMotion />
      <section className="xidig-front__hero">
        <h1>{t('marketing.productTitle')}</h1>
        <p>{t('marketing.productIntro')}</p>
      </section>
      <div className="xidig-front__grid xidig-front__grid--numbered">
        {SECTIONS.map((section) => (
          <div
            key={section.bodyKey}
            className={`xidig-front-card${section.vignette ? ' xidig-front-card--vig' : ''}`}
            data-reveal
          >
            {section.vignette ? (
              <Vignette kind={section.vignette} labels={vigLabels} compact />
            ) : null}
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
